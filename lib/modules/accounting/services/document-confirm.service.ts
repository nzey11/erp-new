/**
 * DocumentConfirmService
 *
 * Transactional core for document confirmation.
 *
 * confirmDocumentTransactional():
 *   validate → create stock movements → update stock projection
 *   → update average costs → mark document confirmed
 *   → write DocumentConfirmed outbox event
 *
 * All post-confirmation side effects (balance, journal, payment) are handled
 * by outbox event handlers. This service does NOT know about those handlers.
 */

import { db, toNumber } from "@/lib/shared/db";
import type { DocumentType } from "@/lib/generated/prisma/client";
import {
  affectsStock,
  isStockDecrease,
  isStockIncrease,
  isInventoryCount,
} from "@/lib/modules/accounting/inventory/predicates";
import { affectsBalance } from "@/lib/modules/accounting/finance/predicates";
import { createOutboxEvent } from "@/lib/events";
import {
  getDocTypeName,
  getDocStatusName,
} from "@/lib/modules/accounting/documents";
import {
  validateTransition,
  DocumentStateError,
} from "@/lib/modules/accounting/document-states";
import {
  checkStockAvailability,
  updateAverageCostOnReceipt,
  updateAverageCostOnTransfer,
  updateTotalCostValue,
} from "@/lib/modules/accounting/inventory/stock";
import {
  createMovementsForDocument,
  reconcileStockRecord,
} from "@/lib/modules/accounting/inventory/stock-movements";
import { recalculateBalance } from "./balance.service";
import { reverseEntryWithTx } from "@/lib/modules/accounting/finance/journal";

// Re-export so callers only need one import
export { DocumentStateError } from "@/lib/modules/accounting/document-states";

// ---------------------------------------------------------------------------
// Domain error — thrown inside the service, caught in the route
// ---------------------------------------------------------------------------

export class DocumentConfirmError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "DocumentConfirmError";
  }
}

// ---------------------------------------------------------------------------
// Race condition protection — optimistic locking for outgoing_shipment
// ---------------------------------------------------------------------------

/**
 * Atomically reserve stock using optimistic locking (StockRecord.version).
 * Only applied for `outgoing_shipment` and `stock_transfer` — user-initiated
 * operations where two concurrent confirms could both pass the availability
 * check and then both decrement stock below zero.
 *
 * Strategy: read version → updateMany with version condition → if count=0, retry.
 * On success, `reconcileStockRecord` (called after movements) will recalculate
 * the exact quantity from movement history and overwrite the decrement.
 * The version bump is what guards the critical section.
 *
 * @throws Error if stock is insufficient or max retries exceeded
 */
async function reserveStockWithOptimisticLock(
  productId: string,
  warehouseId: string,
  quantity: number,
  tenantId: string
): Promise<void> {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await db.stockRecord.findFirst({
      where: { productId, warehouseId },
    });

    const available = typeof record?.quantity === "number"
      ? record.quantity
      : Number(record?.quantity ?? 0);

    if (available < quantity) {
      // Re-check with fresh data — another transaction may have already decremented
      throw new DocumentConfirmError(
        `Конфликт остатков: недостаточно товара. Доступно ${available} шт., требуется ${quantity} шт.`,
        409
      );
    }

    if (!record) return; // No record to lock (will be created by reconcile)

    const updated = await db.stockRecord.updateMany({
      where: {
        warehouseId,
        productId,
        version: record.version,
        quantity: { gte: quantity },
      },
      data: {
        quantity: { decrement: quantity },
        version: { increment: 1 },
      },
    });

    if (updated.count > 0) return; // Lock acquired
    // Conflict — retry
  }

  throw new DocumentConfirmError(
    "Конфликт остатков: данные изменились. Попробуйте ещё раз.",
    409
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shallow document shape needed by the transactional core */
interface DocumentWithItems {
  id: string;
  type: DocumentType;
  status: string;
  warehouseId: string | null;
  targetWarehouseId: string | null;
  counterpartyId: string | null;
  totalAmount: number;
  paymentType: string | null;
  number: string;
  createdBy: string | null;
  confirmedAt: Date | null;
  date: Date;
  items: Array<{
    productId: string;
    variantId: string | null;
    quantity: number;
    price: number;
    expectedQty: number | null;
    actualQty: number | null;
    difference: number | null;
  }>;
}

/**
 * Validate the document is in a confirmable state.
 * Throws DocumentConfirmError on any violation.
 */
async function validateForConfirmation(doc: DocumentWithItems): Promise<void> {
  if (!doc) {
    throw new DocumentConfirmError("Документ не найден", 404);
  }

  // Structural transition guard — uses the state machine
  try {
    validateTransition(doc.type, doc.status as import("@/lib/generated/prisma/client").DocumentStatus, "confirmed");
  } catch (e) {
    if (e instanceof DocumentStateError) {
      throw new DocumentConfirmError(e.message, 400);
    }
    throw e;
  }

  if (doc.items.length === 0) {
    throw new DocumentConfirmError("Нельзя подтвердить документ без позиций", 400);
  }

  // Inventory count: all actualQty must be filled and warehouse required
  if (isInventoryCount(doc.type)) {
    const missingActual = doc.items.some((i) => i.actualQty == null);
    if (missingActual) {
      throw new DocumentConfirmError(
        "Заполните фактическое количество для всех позиций",
        400
      );
    }
    if (!doc.warehouseId) {
      throw new DocumentConfirmError("Укажите склад для инвентаризации", 400);
    }
  }

  // Check stock availability for outgoing / transfer documents
  if ((isStockDecrease(doc.type) || doc.type === "stock_transfer") && doc.warehouseId) {
    const shortages = await checkStockAvailability(
      doc.warehouseId,
      doc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
    );

    if (shortages.length > 0) {
      const products = await db.product.findMany({
        where: { id: { in: shortages.map((s) => s.productId) } },
        select: { id: true, name: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p.name]));

      throw new DocumentConfirmError(
        doc.type === "stock_transfer"
          ? "Недостаточно остатков на складе-источнике"
          : "Недостаточно остатков на складе",
        400,
        {
          shortages: shortages.map((s) => ({
            ...s,
            productName: productMap.get(s.productId) || s.productId,
          })),
        }
      );
    }
  }
}

/**
 * Update average costs for a confirmed document.
 * Must be called after stock projection (updateStockForDocument) has run.
 * @param preConfirmQty - Map of productId → quantity BEFORE this confirmation ran.
 */
async function updateAverageCostForDocument(
  doc: DocumentWithItems,
  preConfirmQty: Map<string, number>
): Promise<void> {
  if (!doc.warehouseId) return;

  if (isStockIncrease(doc.type)) {
    for (const item of doc.items) {
      const oldQty = preConfirmQty.get(item.productId) ?? 0;
      await updateAverageCostOnReceipt(
        doc.warehouseId,
        item.productId,
        item.quantity,
        item.price,
        oldQty
      );
    }
  } else if (doc.type === "stock_transfer" && doc.targetWarehouseId) {
    for (const item of doc.items) {
      const targetPreQty = preConfirmQty.get(`target:${item.productId}`) ?? 0;
      await updateAverageCostOnTransfer(
        doc.warehouseId,
        doc.targetWarehouseId,
        item.productId,
        item.quantity,
        targetPreQty
      );
      await updateTotalCostValue(doc.warehouseId, item.productId);
    }
  } else if (isStockDecrease(doc.type)) {
    for (const item of doc.items) {
      await updateTotalCostValue(doc.warehouseId, item.productId);
    }
  }
}

// ---------------------------------------------------------------------------
// Public: Transactional core
// ---------------------------------------------------------------------------

export interface ConfirmedDocumentResult {
  id: string;
  type: DocumentType;
  status: string;
  number: string;
  totalAmount: number;
  warehouseId: string | null;
  targetWarehouseId: string | null;
  counterpartyId: string | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  date: Date;
  typeName: string;
  statusName: string;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    price: number;
    total: number;
    product: { id: string; name: string; sku: string | null } | null;
  }>;
  warehouse: { id: string; name: string } | null;
  targetWarehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
}

/**
 * Confirm a document with strict operation ordering.
 *
 * Critical sequence (status update is intentionally LAST):
 *   1. Load document + items
 *   2. Validate (guards, stock availability)
 *   3. Create immutable stock movements  (idempotent)
 *   4. Update StockRecord projections    (idempotent full-recalc)
 *   5. Update average costs
 *   6. Mark document confirmed           ← only succeeds if all above pass
 *
 * Note: steps 3–5 use their own DB calls (not a single Prisma transaction)
 * because those functions pre-date this service. The key invariant is:
 * document.status becomes "confirmed" ONLY after all stock effects succeed.
 * All stock ops are idempotent, so a crash between steps is recoverable.
 *
 * Returns the confirmed document or throws DocumentConfirmError.
 */
export async function confirmDocumentTransactional(
  documentId: string,
  actor: string | null
): Promise<ConfirmedDocumentResult> {
  // Load document for validation
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: { items: true },
  });

  if (!doc) {
    throw new DocumentConfirmError("Документ не найден", 404);
  }

  // Map Prisma Decimal fields to number for internal processing
  const docWithNumbers: DocumentWithItems = {
    ...doc,
    totalAmount: toNumber(doc.totalAmount),
    items: doc.items.map((i) => ({
      ...i,
      price: toNumber(i.price),
      quantity: toNumber(i.quantity),
      expectedQty: i.expectedQty !== null ? toNumber(i.expectedQty) : null,
      actualQty: i.actualQty !== null ? toNumber(i.actualQty) : null,
      difference: i.difference !== null ? toNumber(i.difference) : null,
    })),
  };

  // Step 2: Validate — throws DocumentConfirmError on any violation
  await validateForConfirmation(docWithNumbers);

  // Step 2b: Optimistic lock for user-initiated outgoing ops (race condition protection)
  // Applied AFTER availability check passes — guards the window between check and movement creation.
  // Only for outgoing_shipment and stock_transfer (user-initiated, not inventory adjustments).
  if (
    (doc.type === "outgoing_shipment" || doc.type === "stock_transfer") &&
    doc.warehouseId
  ) {
    for (const item of docWithNumbers.items) {
      await reserveStockWithOptimisticLock(
        item.productId,
        doc.warehouseId,
        item.quantity,
        doc.tenantId
      );
    }
  }

  // Steps 3–5: Critical stock effects (must all succeed before status update)
  if (affectsStock(doc.type)) {
    // Snapshot pre-confirmation stock quantities for AVCO calculation.
    // Must be read BEFORE createMovementsForDocument runs (which calls reconcileStockRecord).
    const preConfirmQty = new Map<string, number>();
    if (isStockIncrease(doc.type) && doc.warehouseId) {
      for (const item of docWithNumbers.items) {
        const record = await db.stockRecord.findUnique({
          where: { warehouseId_productId: { warehouseId: doc.warehouseId!, productId: item.productId } },
        });
        preConfirmQty.set(item.productId, toNumber(record?.quantity ?? 0));
      }
    } else if (doc.type === "stock_transfer" && doc.targetWarehouseId) {
      for (const item of docWithNumbers.items) {
        const targetRecord = await db.stockRecord.findUnique({
          where: { warehouseId_productId: { warehouseId: doc.targetWarehouseId!, productId: item.productId } },
        });
        preConfirmQty.set(`target:${item.productId}`, toNumber(targetRecord?.quantity ?? 0));
      }
    }

    // 3. Immutable movement log + reconciles StockRecord projection (idempotent)
    // Note: createMovementsForDocument already calls reconcileStockRecord internally,
    // so StockRecord is up-to-date after this call. No separate updateStockForDocument needed.
    await createMovementsForDocument({
      id: doc.id,
      type: doc.type,
      warehouseId: doc.warehouseId,
      targetWarehouseId: doc.targetWarehouseId,
      items: doc.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: toNumber(i.quantity),
        price: toNumber(i.price),
      })),
    });

    // 4. Average cost update (uses updated StockRecord from step 3)
    await updateAverageCostForDocument(docWithNumbers, preConfirmQty);
  }

  // Step 5b: inventory_count — adjustment documents (write_off / stock_receipt) are now
  // created MANUALLY by the user via buttons on the confirmed document page.
  // Auto-creation has been removed to give users full control over adjustments.

  // Step 6: Mark confirmed + write outbox event — atomic transaction
  // Only reached if steps 3–5 all succeeded
  const confirmedAt = new Date();
  
  const confirmed = await db.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id: documentId },
      data: {
        status: "confirmed",
        confirmedAt,
        confirmedBy: actor,
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    });

    // Write outbox event in same transaction
    await createOutboxEvent(
      tx,
      {
        type: "DocumentConfirmed",
        occurredAt: confirmedAt,
        payload: {
          documentId: updated.id,
          documentType: updated.type,
          documentNumber: updated.number,
          counterpartyId: updated.counterpartyId,
          warehouseId: updated.warehouseId,
          totalAmount: toNumber(updated.totalAmount),
          confirmedAt,
          confirmedBy: actor,
          tenantId: updated.tenantId,
        },
      },
      "Document",
      updated.id
    );

    return updated;
  });

  return {
    ...confirmed,
    totalAmount: toNumber(confirmed.totalAmount),
    items: confirmed.items.map((i) => ({
      ...i,
      price: toNumber(i.price),
      total: toNumber(i.total),
      quantity: toNumber(i.quantity),
    })),
    typeName: getDocTypeName(confirmed.type),
    statusName: getDocStatusName(confirmed.status),
  } as ConfirmedDocumentResult;
}

// ---------------------------------------------------------------------------
// Public: Document Cancellation
// ---------------------------------------------------------------------------

export class DocumentCancelError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "DocumentCancelError";
  }
}

export interface CancelledDocumentResult {
  id: string;
  type: DocumentType;
  status: string;
  number: string;
  totalAmount: number;
  warehouseId: string | null;
  targetWarehouseId: string | null;
  counterpartyId: string | null;
  cancelledAt: Date | null;
  date: Date;
  typeName: string;
  statusName: string;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    price: number;
    total: number;
    product: { id: string; name: string; sku: string | null } | null;
  }>;
  warehouse: { id: string; name: string } | null;
  targetWarehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
}

/**
 * Cancel a document with proper ERP flow.
 *
 * This function ensures:
 * - State machine transition is valid
 * - Reversing stock movements are created (idempotent)
 * - Counterparty balance is recalculated
 *
 * @param documentId - The document to cancel
 * @param actor - User performing the cancellation (for audit)
 * @returns The cancelled document
 */
export async function cancelDocumentTransactional(
  documentId: string,
  actor: string | null
): Promise<CancelledDocumentResult> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: { items: true },
  });

  if (!doc) {
    throw new DocumentCancelError("Документ не найден", 404);
  }

  // Idempotency: already cancelled — return early before state machine throws
  if (doc.status === "cancelled") {
    return {
      ...doc,
      totalAmount: toNumber(doc.totalAmount),
      typeName: getDocTypeName(doc.type),
      statusName: getDocStatusName(doc.status),
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as CancelledDocumentResult;
  }

  // Validate transition through state machine
  try {
    validateTransition(doc.type, doc.status as import("@/lib/generated/prisma/client").DocumentStatus, "cancelled");
  } catch (e) {
    if (e instanceof DocumentStateError) {
      throw new DocumentCancelError(e.message, 400);
    }
    throw e;
  }

  // ── Fix 3: Block cancellation if a confirmed Finance Payment exists ──────
  // Finance Payments linked via documentId are authoritative proof of settlement.
  // Must cancel the Payment first (1C/MS Dynamics behaviour).
  const linkedPayment = await db.payment.findFirst({
    where: { documentId, tenantId: doc.tenantId },
    select: { id: true, number: true },
  });
  if (linkedPayment) {
    throw new DocumentCancelError(
      `Невозможно отменить документ: существует связанный платёж ${linkedPayment.number}. Сначала отмените платёж.`,
      409
    );
  }

  // Atomic transaction: status + reversing stock movements + journal reversals
  const cancelled = await db.$transaction(async (tx) => {
    // Update document status to cancelled
    const updated = await tx.document.update({
      where: { id: documentId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    });

    // ── Reversing stock movements (idempotent) ──────────────────────────────
    if (affectsStock(doc.type)) {
      const alreadyReversed = await tx.stockMovement.count({
        where: { reversesDocumentId: documentId },
      }) > 0;

      if (!alreadyReversed) {
        const originalMovements = await tx.stockMovement.findMany({
          where: { documentId, isReversing: false },
        });

        if (originalMovements.length > 0) {
          const reversingMovements = originalMovements.map((m) => ({
            documentId,
            productId: m.productId,
            warehouseId: m.warehouseId,
            variantId: m.variantId,
            quantity: -m.quantity,
            cost: m.cost,
            totalCost: -m.totalCost,
            type: m.type,
            isReversing: true,
            reversesDocumentId: documentId,
          }));

          await tx.stockMovement.createMany({
            data: reversingMovements,
          });
        }
      }
    }

    // ── Fix 1: Reverse all journal entries for this document ────────────────
    // Idempotent: reverseEntryWithTx() is a no-op if entry.isReversed = true.
    const journalEntries = await tx.journalEntry.findMany({
      where: {
        sourceId: documentId,
        isReversed: false,
      },
      select: { id: true, number: true },
    });

    const cancellationDate = new Date();
    for (const entry of journalEntries) {
      await reverseEntryWithTx(tx, entry.id, {
        date: cancellationDate,
        description: `Отмена документа ${doc.number} — сторно проводки ${entry.number}`,
        createdBy: actor ?? undefined,
      });
    }

    return updated;
  });

  // Reconcile StockRecord projections after reversal movements (brings qty back from sum of movements)
  if (affectsStock(doc.type) && doc.warehouseId) {
    const affectedKeys = new Set<string>();
    for (const item of doc.items) {
      affectedKeys.add(`${item.productId}:${doc.warehouseId}`);
    }
    if (doc.targetWarehouseId) {
      for (const item of doc.items) {
        affectedKeys.add(`${item.productId}:${doc.targetWarehouseId}`);
      }
    }
    for (const key of affectedKeys) {
      const [productId, warehouseId] = key.split(":");
      await reconcileStockRecord(productId, warehouseId);
    }
  }

  // Recalculate counterparty balance (outside transaction per requirements)
  if (affectsBalance(doc.type) && doc.counterpartyId) {
    await recalculateBalance(doc.counterpartyId);
  }

  return {
    ...cancelled,
    totalAmount: toNumber(cancelled.totalAmount),
    items: cancelled.items.map((i) => ({
      ...i,
      price: toNumber(i.price),
      total: toNumber(i.total),
      quantity: toNumber(i.quantity),
    })),
    typeName: getDocTypeName(cancelled.type),
    statusName: getDocStatusName(cancelled.status),
  } as CancelledDocumentResult;
}

// ---------------------------------------------------------------------------
// Note: createInventoryAdjustments was removed.
// Adjustment documents (write_off / stock_receipt) are now created
// MANUALLY by the user after confirmation via the document detail page.
// ---------------------------------------------------------------------------

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

import { db } from "@/lib/shared/db";
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
  generateDocumentNumber,
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
  createReversingMovements,
  hasReversingMovements,
} from "@/lib/modules/accounting/inventory/stock-movements";
import { recalculateBalance } from "./balance.service";

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
 */
async function updateAverageCostForDocument(doc: DocumentWithItems): Promise<void> {
  if (!doc.warehouseId) return;

  if (isStockIncrease(doc.type)) {
    for (const item of doc.items) {
      await updateAverageCostOnReceipt(
        doc.warehouseId,
        item.productId,
        item.quantity,
        item.price
      );
    }
  } else if (doc.type === "stock_transfer" && doc.targetWarehouseId) {
    for (const item of doc.items) {
      await updateAverageCostOnTransfer(
        doc.warehouseId,
        doc.targetWarehouseId,
        item.productId,
        item.quantity
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

  // Step 2: Validate — throws DocumentConfirmError on any violation
  await validateForConfirmation(doc);

  // Steps 3–5: Critical stock effects (must all succeed before status update)
  if (affectsStock(doc.type)) {
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
        quantity: i.quantity,
        price: i.price,
      })),
    });

    // 4. Average cost update (uses updated StockRecord from step 3)
    await updateAverageCostForDocument(doc);
  }

  // Step 5b: inventory_count — create linked adjustment documents (write_off / stock_receipt)
  // This IS the stock effect for inventory counts: creating adjustment docs is the critical path.
  if (isInventoryCount(doc.type) && doc.warehouseId) {
    const adjustmentItems = doc.items.map((i) => ({
      productId: i.productId,
      expectedQty: i.expectedQty,
      actualQty: i.actualQty,
      difference: i.difference ?? ((i.actualQty ?? 0) - (i.expectedQty ?? 0)),
      price: i.price,
    }));
    const hasDiscrepancies = adjustmentItems.some((i) => (i.difference ?? 0) !== 0);
    if (hasDiscrepancies) {
      await createInventoryAdjustments(doc.id, doc.warehouseId, adjustmentItems, doc.createdBy);
    }
  }

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
          totalAmount: updated.totalAmount,
          confirmedAt,
          confirmedBy: actor,
        },
      },
      "Document",
      updated.id
    );

    return updated;
  });

  return {
    ...confirmed,
    typeName: getDocTypeName(confirmed.type),
    statusName: getDocStatusName(confirmed.status),
  };
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

  // Validate transition through state machine
  try {
    validateTransition(doc.type, doc.status as import("@/lib/generated/prisma/client").DocumentStatus, "cancelled");
  } catch (e) {
    if (e instanceof DocumentStateError) {
      throw new DocumentCancelError(e.message, 400);
    }
    throw e;
  }

  // Idempotency: already cancelled
  if (doc.status === "cancelled") {
    return {
      ...doc,
      typeName: getDocTypeName(doc.type),
      statusName: getDocStatusName(doc.status),
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as CancelledDocumentResult;
  }

  // Update document status to cancelled
  const cancelled = await db.document.update({
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

  // Create reversing stock movements (idempotent)
  if (affectsStock(doc.type)) {
    const alreadyReversed = await hasReversingMovements(documentId);
    if (!alreadyReversed) {
      await createReversingMovements(documentId);
    }
  }

  // Recalculate counterparty balance
  if (affectsBalance(doc.type) && doc.counterpartyId) {
    await recalculateBalance(doc.counterpartyId);
  }

  return {
    ...cancelled,
    typeName: getDocTypeName(cancelled.type),
    statusName: getDocStatusName(cancelled.status),
  };
}

// ---------------------------------------------------------------------------
// Private: Create inventory adjustment documents
// ---------------------------------------------------------------------------

/**
 * Create write_off (shortages) and stock_receipt (surpluses) linked
 * to the inventory count document.
 * IDEMPOTENT: uses adjustmentsCreated flag + existence check.
 * 
 * Adjustment documents inherit tenantId from parent inventory_count document.
 */
async function createInventoryAdjustments(
  inventoryDocId: string,
  warehouseId: string,
  items: Array<{
    productId: string;
    expectedQty: number | null;
    actualQty: number | null;
    difference: number | null;
    price: number;
  }>,
  createdBy: string | null
): Promise<string[]> {
  // Idempotency check 1: flag + get tenantId from parent
  const inventoryDoc = await db.document.findUnique({
    where: { id: inventoryDocId },
    select: { adjustmentsCreated: true, tenantId: true },
  });

  if (inventoryDoc?.adjustmentsCreated) {
    const existingCount = await db.document.count({
      where: {
        linkedDocumentId: inventoryDocId,
        type: { in: ["write_off", "stock_receipt"] },
      },
    });
    if (existingCount > 0) return []; // Already created
  }

  // Idempotency check 2: documents exist even if flag not set
  const existingDocs = await db.document.findMany({
    where: {
      linkedDocumentId: inventoryDocId,
      type: { in: ["write_off", "stock_receipt"] },
    },
  });

  if (existingDocs.length > 0) {
    await db.document.update({
      where: { id: inventoryDocId },
      data: { adjustmentsCreated: true },
    });
    return existingDocs.map((d) => d.id);
  }

  // Inherit tenantId from parent inventory_count document
  const tenantId = inventoryDoc?.tenantId;
  
  // Guard: tenantId is required for document creation
  if (!tenantId) {
    throw new Error("Cannot create adjustment documents: inventory_count document has no tenantId");
  }

  const shortages = items.filter((i) => (i.difference ?? 0) < 0);
  const surpluses = items.filter((i) => (i.difference ?? 0) > 0);
  const createdIds: string[] = [];

  await db.$transaction(async (tx) => {
    if (shortages.length > 0) {
      const number = await generateDocumentNumber("write_off");
      const writeOffItems = shortages.map((item) => {
        const qty = Math.abs(item.difference ?? 0);
        return { productId: item.productId, quantity: qty, price: item.price, total: qty * item.price };
      });
      const totalAmount = writeOffItems.reduce((s, i) => s + i.total, 0);

      const writeOff = await tx.document.create({
        data: {
          tenantId,  // Inherited from inventory_count
          number,
          type: "write_off",
          status: "confirmed",
          date: new Date(),
          warehouseId,
          linkedDocumentId: inventoryDocId,
          totalAmount,
          description: "Списание по инвентаризации",
          createdBy,
          confirmedAt: new Date(),
          adjustmentsCreated: true,
          items: { create: writeOffItems },
        },
      });
      createdIds.push(writeOff.id);
    }

    if (surpluses.length > 0) {
      const number = await generateDocumentNumber("stock_receipt");
      const receiptItems = surpluses.map((item) => {
        const qty = item.difference ?? 0;
        return { productId: item.productId, quantity: qty, price: item.price, total: qty * item.price };
      });
      const totalAmount = receiptItems.reduce((s, i) => s + i.total, 0);

      const receipt = await tx.document.create({
        data: {
          tenantId,  // Inherited from inventory_count
          number,
          type: "stock_receipt",
          status: "confirmed",
          date: new Date(),
          warehouseId,
          linkedDocumentId: inventoryDocId,
          totalAmount,
          description: "Оприходование по инвентаризации",
          createdBy,
          confirmedAt: new Date(),
          adjustmentsCreated: true,
          items: { create: receiptItems },
        },
      });
      createdIds.push(receipt.id);
    }

    if (createdIds.length > 0) {
      await tx.document.update({
        where: { id: inventoryDocId },
        data: { adjustmentsCreated: true },
      });
    }
  });

  // Update stock movements for adjustment docs
  // Note: reconcileStockRecord is called inside createMovementsForDocument, so no separate updateStockForDocument needed.
  for (const docId of createdIds) {
    const adjDoc = await db.document.findUnique({
      where: { id: docId },
      include: { items: true },
    });
    if (adjDoc?.warehouseId) {
      await createMovementsForDocument({
        id: adjDoc.id,
        type: adjDoc.type,
        warehouseId: adjDoc.warehouseId,
        targetWarehouseId: adjDoc.targetWarehouseId,
        items: adjDoc.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
        })),
      });
    }
  }

  return createdIds;
}

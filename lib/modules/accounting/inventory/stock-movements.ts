/**
 * Inventory domain — immutable stock movement audit log.
 *
 * Each movement records: what moved, where, how much, at what cost,
 * and from which document. Movements are never deleted — cancellation
 * creates reversing movements that offset the originals.
 *
 * Movement rules:
 *   stock_receipt, incoming_shipment, customer_return → receipt (IN)
 *   write_off                                        → write_off (OUT)
 *   outgoing_shipment                                → shipment (OUT)
 *   supplier_return                                  → return (OUT)
 *   stock_transfer                                   → transfer_out (source) + transfer_in (target)
 *   inventory_count adjustments                      → adjustment (±)
 *
 * Idempotency:
 *   Movements are created only once per document.
 *   Cancel creates reversing movements, never deletes.
 *
 * Phase 1.4: moved from lib/modules/accounting/stock-movements.ts
 * Local STOCK_*_TYPES constants removed — now imported from ./predicates.
 * Import path changed to @/lib/modules/accounting/inventory/stock-movements
 */

import { db } from "@/lib/shared/db";
import { DocumentType, MovementType } from "@/lib/generated/prisma/client";
import { STOCK_INCREASE_TYPES, STOCK_DECREASE_TYPES } from "./predicates";

// =============================================
// Movement Type Mapping
// =============================================

/**
 * Get movement type for a document.
 * Returns null if document doesn't affect stock.
 */
export function getMovementTypeForDocument(
  docType: DocumentType,
  isTargetWarehouse: boolean = false
): MovementType | null {
  if (STOCK_INCREASE_TYPES.includes(docType)) {
    return "receipt";
  }

  if (docType === "write_off") {
    return "write_off";
  }

  if (docType === "outgoing_shipment") {
    return "shipment";
  }

  if (docType === "supplier_return") {
    return "return";
  }

  if (docType === "stock_transfer") {
    return isTargetWarehouse ? "transfer_in" : "transfer_out";
  }

  return null;
}

/**
 * Check if document type affects stock.
 */
export function documentAffectsStock(docType: DocumentType): boolean {
  return [
    ...STOCK_INCREASE_TYPES,
    ...STOCK_DECREASE_TYPES,
    "stock_transfer",
  ].includes(docType);
}

// =============================================
// Movement Creation
// =============================================

interface CreateMovementInput {
  documentId: string;
  productId: string;
  warehouseId: string;
  variantId?: string | null;
  quantity: number;
  cost: number;
  totalCost: number;
  type: MovementType;
  isReversing?: boolean;
  reversesDocumentId?: string | null;
}

export async function documentHasMovements(documentId: string): Promise<boolean> {
  const count = await db.stockMovement.count({
    where: { documentId },
  });
  return count > 0;
}

// =============================================
// Aggregation Helper
// =============================================

interface AggregatedItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  price: number;
}

/**
 * Aggregate document items by (productId, variantId).
 * Ensures one movement per unique combination, preventing unique index violations.
 */
function aggregateItems(items: DocumentItem[]): AggregatedItem[] {
  const aggregated = new Map<string, AggregatedItem>();

  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? "null"}`;
    const existing = aggregated.get(key);

    if (existing) {
      const totalQty = existing.quantity + item.quantity;
      const totalValue = existing.quantity * existing.price + item.quantity * item.price;
      existing.quantity = totalQty;
      existing.price = totalQty > 0 ? totalValue / totalQty : item.price;
    } else {
      aggregated.set(key, {
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
        price: item.price,
      });
    }
  }

  return Array.from(aggregated.values());
}

// =============================================
// Main API: Create Movements for Document
// =============================================

interface DocumentItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  price: number;
}

export interface DocumentForMovements {
  id: string;
  type: DocumentType;
  warehouseId: string | null;
  targetWarehouseId: string | null;
  items: DocumentItem[];
}

/**
 * Create stock movements for a confirmed document.
 *
 * IMPORTANT: This function is idempotent.
 * If movements already exist for this document, it returns early.
 *
 * @throws Error if warehouse is missing for stock-affecting document
 */
export async function createMovementsForDocument(
  document: DocumentForMovements
): Promise<{ created: number }> {
  // Idempotency check
  if (await documentHasMovements(document.id)) {
    return { created: 0 };
  }

  if (!documentAffectsStock(document.type)) {
    return { created: 0 };
  }

  const movements: CreateMovementInput[] = [];

  // Aggregate items to prevent duplicate movements
  const aggregatedItems = aggregateItems(document.items);

  // Handle different document types
  if (STOCK_INCREASE_TYPES.includes(document.type)) {
    // IN: stock_receipt, incoming_shipment, customer_return
    if (!document.warehouseId) {
      throw new Error(`Warehouse required for ${document.type}`);
    }

    const movementType = getMovementTypeForDocument(document.type);
    if (!movementType) {
      throw new Error(`Unknown movement type for ${document.type}`);
    }

    for (const item of aggregatedItems) {
      movements.push({
        documentId: document.id,
        productId: item.productId,
        warehouseId: document.warehouseId,
        variantId: item.variantId,
        quantity: item.quantity, // Positive = IN
        cost: item.price,
        totalCost: item.quantity * item.price,
        type: movementType,
      });
    }
  } else if (STOCK_DECREASE_TYPES.includes(document.type)) {
    // OUT: write_off, outgoing_shipment, supplier_return
    if (!document.warehouseId) {
      throw new Error(`Warehouse required for ${document.type}`);
    }

    const movementType = getMovementTypeForDocument(document.type);
    if (!movementType) {
      throw new Error(`Unknown movement type for ${document.type}`);
    }

    for (const item of aggregatedItems) {
      movements.push({
        documentId: document.id,
        productId: item.productId,
        warehouseId: document.warehouseId,
        variantId: item.variantId,
        quantity: -item.quantity, // Negative = OUT
        cost: item.price,
        totalCost: -item.quantity * item.price,
        type: movementType,
      });
    }
  } else if (document.type === "stock_transfer") {
    // Transfer: OUT from source, IN to target
    if (!document.warehouseId || !document.targetWarehouseId) {
      throw new Error("Both source and target warehouses required for stock_transfer");
    }

    for (const item of aggregatedItems) {
      // OUT from source warehouse
      movements.push({
        documentId: document.id,
        productId: item.productId,
        warehouseId: document.warehouseId,
        variantId: item.variantId,
        quantity: -item.quantity, // Negative = OUT
        cost: item.price,
        totalCost: -item.quantity * item.price,
        type: "transfer_out",
      });

      // IN to target warehouse
      movements.push({
        documentId: document.id,
        productId: item.productId,
        warehouseId: document.targetWarehouseId,
        variantId: item.variantId,
        quantity: item.quantity, // Positive = IN
        cost: item.price,
        totalCost: item.quantity * item.price,
        type: "transfer_in",
      });
    }
  }

  // Create all movements in a transaction
  if (movements.length > 0) {
    await db.$transaction(
      movements.map((m) => db.stockMovement.create({ data: m }))
    );

    // Reconcile StockRecord projections for affected products
    const affectedKeys = new Set<string>();
    for (const m of movements) {
      affectedKeys.add(`${m.productId}:${m.warehouseId}`);
    }

    for (const key of affectedKeys) {
      const [productId, warehouseId] = key.split(":");
      await reconcileStockRecord(productId, warehouseId);
    }
  }

  return { created: movements.length };
}

// =============================================
// Cancel: Create Reversing Movements
// =============================================

/**
 * Check if reversing movements already exist for a document.
 * Used for idempotency in cancel flow.
 */
export async function hasReversingMovements(documentId: string): Promise<boolean> {
  const count = await db.stockMovement.count({
    where: { reversesDocumentId: documentId },
  });
  return count > 0;
}

/**
 * Create reversing movements when a document is cancelled.
 *
 * IMPORTANT: Creates NEW movements that reverse the originals.
 * Original movements are NEVER deleted — they remain as audit history.
 *
 * Idempotency: if reversing movements already exist, returns early.
 *
 * @param documentId — the document being cancelled
 * @returns number of reversing movements created
 */
export async function createReversingMovements(
  documentId: string
): Promise<{ created: number }> {
  if (await hasReversingMovements(documentId)) {
    return { created: 0 };
  }

  const originalMovements = await db.stockMovement.findMany({
    where: { documentId, isReversing: false },
  });

  if (originalMovements.length === 0) {
    return { created: 0 };
  }

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

  await db.$transaction(
    reversingMovements.map((m) => db.stockMovement.create({ data: m }))
  );

  // Reconcile StockRecord projections for affected products
  const affectedKeys = new Set<string>();
  for (const m of originalMovements) {
    affectedKeys.add(`${m.productId}:${m.warehouseId}`);
  }

  for (const key of affectedKeys) {
    const [productId, warehouseId] = key.split(":");
    await reconcileStockRecord(productId, warehouseId);
  }

  return { created: reversingMovements.length };
}

// =============================================
// Query Helpers
// =============================================

/**
 * Get all movements for a product in a warehouse.
 */
export async function getProductMovements(
  productId: string,
  warehouseId: string,
  options?: { from?: Date; to?: Date }
) {
  return db.stockMovement.findMany({
    where: {
      productId,
      warehouseId,
      createdAt: {
        gte: options?.from,
        lte: options?.to,
      },
    },
    orderBy: { createdAt: "asc" },
    include: {
      document: {
        select: { id: true, number: true, type: true },
      },
    },
  });
}

/**
 * Calculate stock from movements (source of truth).
 * This is the "projection" from movements to current stock.
 */
export async function calculateStockFromMovements(
  productId: string,
  warehouseId: string
): Promise<number> {
  const result = await db.stockMovement.aggregate({
    where: { productId, warehouseId },
    _sum: { quantity: true },
  });

  return result._sum.quantity ?? 0;
}

/**
 * Reconcile StockRecord with movements.
 * Updates StockRecord to match the sum of movements.
 * Uses OCC (Optimistic Concurrency Control) with retry logic.
 */
export async function reconcileStockRecord(
  productId: string,
  warehouseId: string
): Promise<number> {
  const quantity = await calculateStockFromMovements(productId, warehouseId);

  const MAX_RETRIES = 3;
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      // Try to update existing record with version check
      const existing = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      });

      if (existing) {
        // Update with version check (OCC)
        // Use raw query for atomic update with version check
        const updated = await db.$executeRaw`
          UPDATE "StockRecord"
          SET quantity = ${quantity}, version = version + 1, "updatedAt" = NOW()
          WHERE id = ${existing.id} AND version = ${existing.version}
        `;

        if (updated === 0) {
          // Version mismatch - record was modified concurrently
          throw new Error("OCC conflict");
        }
      } else {
        // Create new record
        await db.stockRecord.create({
          data: { warehouseId, productId, quantity, version: 0 },
        });
      }

      return quantity;
    } catch (e: unknown) {
      const error = e as { message?: string };
      // Check for OCC conflict or Prisma P2025 (record not found)
      if (
        (error.message === "OCC conflict" ||
          (e as { code?: string }).code === "P2025") &&
        retries < MAX_RETRIES - 1
      ) {
        retries++;
        // Small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }
      throw e;
    }
  }

  throw new Error(
    `Failed to reconcile StockRecord after ${MAX_RETRIES} retries`
  );
}

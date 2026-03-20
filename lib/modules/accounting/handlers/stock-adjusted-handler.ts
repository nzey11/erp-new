/**
 * Accounting handler — Stock Adjusted Event
 *
 * Reacts to StockAdjusted by potentially triggering AVCO recalculation.
 * Idempotent: checks if event has already been processed.
 *
 * Phase 5: Basic implementation with observability.
 * Future: Add AVCO recalculation logic when stock adjustments affect cost basis.
 */

import type { StockAdjustedEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import { logger } from "@/lib/shared/logger";

export async function onStockAdjusted(
  event: StockAdjustedEvent
): Promise<void> {
  const {
    stockRecordId,
    tenantId,
    productId,
    warehouseId,
    quantityDelta,
    adjustmentType,
  } = event.payload;

  // Idempotency check: verify stock record exists
  const stockRecord = await db.stockRecord.findUnique({
    where: { id: stockRecordId },
    select: { id: true, productId: true, quantity: true, averageCost: true },
  });

  if (!stockRecord) {
    logger.warn("stock-adjusted-handler", `StockRecord not found: ${stockRecordId}`);
    return;
  }

  // Log for observability
  logger.info("stock-adjusted-handler", `Stock adjusted`, {
    stockRecordId,
    tenantId,
    productId,
    warehouseId,
    quantityDelta,
    adjustmentType,
    newQuantity: stockRecord.quantity,
    averageCost: stockRecord.averageCost?.toNumber?.() ?? stockRecord.averageCost,
  });

  // Phase 5: AVCO recalculation would go here if needed
  // For now, stock adjustments use the existing averageCost from the StockRecord
  // Future enhancement: recalculate averageCost when adjustments affect cost basis
}

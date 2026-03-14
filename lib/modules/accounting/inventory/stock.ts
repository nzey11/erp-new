/**
 * Inventory domain — stock record management.
 *
 * Owns the StockRecord projection: current quantity and cost basis
 * per (warehouse, product) pair. Functions here read from confirmed
 * Documents and write to StockRecord as a fast-read projection.
 *
 * Phase 1.4: moved from lib/modules/accounting/stock.ts
 * Import path changed to @/lib/modules/accounting/inventory/stock
 */

import { db } from "@/lib/shared/db";

/** Check stock availability before confirming an outgoing document */
export async function checkStockAvailability(
  warehouseId: string,
  items: { productId: string; quantity: number }[]
): Promise<{ productId: string; available: number; required: number }[]> {
  const shortages: { productId: string; available: number; required: number }[] = [];

  for (const item of items) {
    const stock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: item.productId } },
    });
    const available = stock?.quantity ?? 0;
    if (available < item.quantity) {
      shortages.push({
        productId: item.productId,
        available,
        required: item.quantity,
      });
    }
  }

  return shortages;
}

/** Get stock for a product in a warehouse */
export async function getProductStock(warehouseId: string, productId: string) {
  const record = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return record?.quantity ?? 0;
}

/** Get total stock for a product across all warehouses */
export async function getProductTotalStock(productId: string) {
  const result = await db.stockRecord.aggregate({
    _sum: { quantity: true },
    where: { productId },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Update average cost when receiving stock (incoming_shipment, stock_receipt, customer_return).
 * Formula: newAvgCost = (oldQty * oldCost + newQty * newPrice) / (oldQty + newQty)
 */
export async function updateAverageCostOnReceipt(
  warehouseId: string,
  productId: string,
  incomingQty: number,
  incomingPrice: number
): Promise<void> {
  const record = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });

  const oldQty = record?.quantity ?? 0;
  const oldCost = record?.averageCost ?? 0;
  const totalQty = oldQty + incomingQty;

  const newAverageCost =
    totalQty > 0
      ? (oldQty * oldCost + incomingQty * incomingPrice) / totalQty
      : incomingPrice;

  await db.stockRecord.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    update: {
      averageCost: newAverageCost,
      totalCostValue: totalQty * newAverageCost,
    },
    create: {
      warehouseId,
      productId,
      quantity: 0,
      averageCost: newAverageCost,
      totalCostValue: 0,
    },
  });
}

/**
 * Update average cost on transfer to target warehouse.
 * Target warehouse receives stock at source warehouse's average cost.
 */
export async function updateAverageCostOnTransfer(
  sourceWarehouseId: string,
  targetWarehouseId: string,
  productId: string,
  transferQty: number
): Promise<void> {
  const sourceRecord = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId: sourceWarehouseId, productId } },
  });
  const sourceCost = sourceRecord?.averageCost ?? 0;

  await updateAverageCostOnReceipt(targetWarehouseId, productId, transferQty, sourceCost);
}

/**
 * Update totalCostValue after stock quantity changes (for outgoing documents).
 * Average cost stays the same, only totalCostValue is recalculated.
 */
export async function updateTotalCostValue(
  warehouseId: string,
  productId: string
): Promise<void> {
  const record = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });

  if (record) {
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId, productId } },
      data: {
        totalCostValue: record.quantity * record.averageCost,
      },
    });
  }
}

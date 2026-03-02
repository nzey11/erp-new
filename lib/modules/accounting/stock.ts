import { db } from "@/lib/shared/db";
import { STOCK_INCREASE_TYPES, STOCK_DECREASE_TYPES } from "./documents";

/**
 * Recalculate stock for a product in a warehouse from confirmed documents.
 * Stock = increases - decreases + transfers_in - transfers_out
 *
 * Note: inventory_count does NOT directly affect stock.
 * It creates linked write_off / stock_receipt documents that handle adjustments.
 */
export async function recalculateStock(warehouseId: string, productId: string) {
  // Sum increases (stock_receipt, incoming_shipment, customer_return)
  const increaseResult = await db.documentItem.aggregate({
    _sum: { quantity: true },
    where: {
      productId,
      document: {
        warehouseId,
        status: "confirmed",
        type: { in: STOCK_INCREASE_TYPES },
      },
    },
  });

  // Sum decreases (write_off, outgoing_shipment, supplier_return)
  const decreaseResult = await db.documentItem.aggregate({
    _sum: { quantity: true },
    where: {
      productId,
      document: {
        warehouseId,
        status: "confirmed",
        type: { in: STOCK_DECREASE_TYPES },
      },
    },
  });

  // Transfers IN to this warehouse
  const transferInResult = await db.documentItem.aggregate({
    _sum: { quantity: true },
    where: {
      productId,
      document: {
        targetWarehouseId: warehouseId,
        status: "confirmed",
        type: "stock_transfer",
      },
    },
  });

  // Transfers OUT from this warehouse
  const transferOutResult = await db.documentItem.aggregate({
    _sum: { quantity: true },
    where: {
      productId,
      document: {
        warehouseId,
        status: "confirmed",
        type: "stock_transfer",
      },
    },
  });

  const quantity =
    (increaseResult._sum.quantity ?? 0) -
    (decreaseResult._sum.quantity ?? 0) +
    (transferInResult._sum.quantity ?? 0) -
    (transferOutResult._sum.quantity ?? 0);

  await db.stockRecord.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    update: { quantity },
    create: { warehouseId, productId, quantity },
  });

  return quantity;
}

/** Recalculate stock for all products in a document */
export async function updateStockForDocument(documentId: string) {
  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { items: true },
  });

  const productIds = [...new Set(doc.items.map((i) => i.productId))];

  for (const productId of productIds) {
    if (doc.warehouseId) {
      await recalculateStock(doc.warehouseId, productId);
    }
    if (doc.type === "stock_transfer" && doc.targetWarehouseId) {
      await recalculateStock(doc.targetWarehouseId, productId);
    }
  }
}

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
  // Get source warehouse average cost
  const sourceRecord = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId: sourceWarehouseId, productId } },
  });
  const sourceCost = sourceRecord?.averageCost ?? 0;

  // Update target warehouse using source cost
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


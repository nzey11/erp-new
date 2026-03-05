/**
 * COGS (Cost of Goods Sold) calculation
 *
 * COGS is recognized at the moment of shipment (outgoing_shipment),
 * using average cost at the time of shipment — NOT at the time of purchase.
 *
 * This reflects the correct accounting: Дт 90.2 Кт 41.1
 */

import { db } from "@/lib/shared/db";

/**
 * Calculate COGS for a specific outgoing_shipment document
 * Uses average cost from StockRecord at the time of shipment
 */
export async function calculateCogsForShipment(documentId: string): Promise<{
  totalCogs: number;
  lines: { productId: string; quantity: number; averageCost: number; cogs: number }[];
}> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      items: true,
    },
  });

  if (!doc || doc.type !== "outgoing_shipment") {
    return { totalCogs: 0, lines: [] };
  }

  const lines: { productId: string; quantity: number; averageCost: number; cogs: number }[] = [];
  let totalCogs = 0;

  for (const item of doc.items) {
    // Get average cost for this product in the warehouse at shipment time
    const stockRecord = doc.warehouseId
      ? await db.stockRecord.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: doc.warehouseId,
              productId: item.productId,
            },
          },
        })
      : null;

    const averageCost = stockRecord?.averageCost ?? 0;
    const cogs = item.quantity * averageCost;

    lines.push({
      productId: item.productId,
      quantity: item.quantity,
      averageCost,
      cogs,
    });

    totalCogs += cogs;
  }

  return { totalCogs, lines };
}

/**
 * Calculate total COGS from outgoing shipments over a period
 * Uses LedgerLine debit turnovers on account 90.2 (correct method)
 */
export async function getCogsFromLedger(
  dateFrom: Date,
  dateTo: Date
): Promise<number> {
  const cogsAccount = await db.account.findUnique({ where: { code: "90.2" } });
  if (!cogsAccount) return 0;

  const agg = await db.ledgerLine.aggregate({
    _sum: { debit: true },
    where: {
      accountId: cogsAccount.id,
      entry: {
        date: { gte: dateFrom, lte: dateTo },
        isReversed: false,
      },
    },
  });

  return agg._sum.debit ?? 0;
}

import { db } from "@/lib/shared/db";

/** Generate P&L report for a date range */
export async function generateProfitLoss(dateFrom: Date, dateTo: Date) {
  // Revenue: outgoing shipments
  const revenue = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "outgoing_shipment",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  // COGS: incoming shipments
  const cogs = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "incoming_shipment",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  // Customer returns reduce revenue
  const customerReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "customer_return",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  // Supplier returns reduce COGS
  const supplierReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "supplier_return",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  const grossRevenue = revenue._sum.totalAmount ?? 0;
  const returns = customerReturns._sum.totalAmount ?? 0;
  const netRevenue = grossRevenue - returns;
  const totalCogs = (cogs._sum.totalAmount ?? 0) - (supplierReturns._sum.totalAmount ?? 0);
  const grossProfit = netRevenue - totalCogs;
  const margin = netRevenue > 0 ? grossProfit / netRevenue : 0;

  return {
    period: { from: dateFrom, to: dateTo },
    grossRevenue,
    customerReturns: returns,
    netRevenue,
    cogs: totalCogs,
    supplierReturns: supplierReturns._sum.totalAmount ?? 0,
    grossProfit,
    margin,
  };
}

/** Generate cash flow report for a date range */
export async function generateCashFlow(dateFrom: Date, dateTo: Date) {
  const incomingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "incoming_payment",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  const outgoingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: "outgoing_payment",
      status: "confirmed",
      confirmedAt: { gte: dateFrom, lte: dateTo },
    },
  });

  const cashIn = incomingPayments._sum.totalAmount ?? 0;
  const cashOut = outgoingPayments._sum.totalAmount ?? 0;
  const netCashFlow = cashIn - cashOut;

  return {
    period: { from: dateFrom, to: dateTo },
    cashIn,
    cashOut,
    netCashFlow,
  };
}

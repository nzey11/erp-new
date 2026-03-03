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

/** Get all non-zero counterparty balances */
export async function getAllBalances() {
  return db.counterpartyBalance.findMany({
    where: { NOT: { balanceRub: 0 } },
    include: { counterparty: { select: { id: true, name: true, type: true } } },
    orderBy: { balanceRub: "desc" },
  });
}

/**
 * Recalculate counterparty balance from confirmed documents.
 *
 * Positive balance = they owe us (accounts receivable)
 * Negative balance = we owe them (accounts payable)
 *
 * + outgoing_shipment  (we shipped -> they owe us)
 * - customer_return    (customer returned -> reduce their debt)
 * - incoming_payment   (customer paid -> reduce their debt)
 * - incoming_shipment  (supplier shipped to us -> we owe them)
 * + supplier_return    (we returned to supplier -> reduce our debt)
 * + outgoing_payment   (we paid supplier -> reduce our debt)
 */
export async function recalculateBalance(counterpartyId: string) {
  const outgoingShipments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "outgoing_shipment", status: "confirmed" },
  });

  const customerReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "customer_return", status: "confirmed" },
  });

  const incomingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "incoming_payment", status: "confirmed" },
  });

  const incomingShipments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "incoming_shipment", status: "confirmed" },
  });

  const supplierReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "supplier_return", status: "confirmed" },
  });

  const outgoingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "outgoing_payment", status: "confirmed" },
  });

  const balanceRub =
    (outgoingShipments._sum.totalAmount ?? 0) -
    (customerReturns._sum.totalAmount ?? 0) -
    (incomingPayments._sum.totalAmount ?? 0) -
    (incomingShipments._sum.totalAmount ?? 0) +
    (supplierReturns._sum.totalAmount ?? 0) +
    (outgoingPayments._sum.totalAmount ?? 0);

  await db.counterpartyBalance.upsert({
    where: { counterpartyId },
    update: { balanceRub },
    create: { counterpartyId, balanceRub },
  });

  return balanceRub;
}

/** Get balance for a single counterparty */
export async function getBalance(counterpartyId: string) {
  const record = await db.counterpartyBalance.findUnique({
    where: { counterpartyId },
  });
  return record?.balanceRub ?? 0;
}

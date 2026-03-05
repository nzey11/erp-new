import { db } from "@/lib/shared/db";
import { generateProfitLoss as _generateProfitLoss } from "./reports/profit-loss";
import { generateBalanceSheet as _generateBalanceSheet } from "./reports/balance-sheet";
import { generateCashFlow as _generateCashFlow } from "./reports/cash-flow";

/** Generate full P&L report for a date range */
export async function generateProfitLoss(dateFrom: Date, dateTo: Date) {
  return _generateProfitLoss(dateFrom, dateTo);
}

/** Generate Balance Sheet (Assets = Liabilities + Equity) */
export async function generateBalanceSheet(asOfDate: Date) {
  return _generateBalanceSheet(asOfDate);
}

/** Generate full cash flow report for a date range */
export async function generateCashFlow(dateFrom: Date, dateTo: Date) {
  return _generateCashFlow(dateFrom, dateTo);
}

/** Get all non-zero counterparty balances */
export async function getAllBalances() {
  return db.counterpartyBalance.findMany({
    where: { NOT: { balanceRub: 0 } },
    include: { counterparty: { select: { id: true, name: true, type: true } } },
    orderBy: { balanceRub: "desc" },
  });
}

/** Get total receivables as of date */
async function getTotalReceivables(asOfDate: Date): Promise<number> {
  const result = await db.counterpartyBalance.aggregate({
    _sum: { balanceRub: true },
    where: {
      balanceRub: { gt: 0 },
      // Would ideally filter by date, but counterpartyBalance is current snapshot
    },
  });
  return result._sum.balanceRub ?? 0;
}

/** Get total payables as of date */
async function getTotalPayables(asOfDate: Date): Promise<number> {
  const result = await db.counterpartyBalance.aggregate({
    _sum: { balanceRub: true },
    where: {
      balanceRub: { lt: 0 },
    },
  });
  return Math.abs(result._sum.balanceRub ?? 0);
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

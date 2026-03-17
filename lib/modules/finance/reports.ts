import { db, toNumber } from "@/lib/shared/db";
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

/** Get balance for a single counterparty */
export async function getBalance(counterpartyId: string) {
  const record = await db.counterpartyBalance.findUnique({
    where: { counterpartyId },
  });
  return toNumber(record?.balanceRub ?? 0);
}

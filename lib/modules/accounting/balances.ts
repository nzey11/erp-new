/**
 * Ledger balance calculation functions
 * All report figures must be derived from LedgerLine, not document aggregates
 */

import { db, toNumber } from "@/lib/shared/db";

export interface AccountBalanceResult {
  accountId: string;
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  balance: number; // debit - credit (positive = debit balance, negative = credit balance)
}

/** Get debit and credit totals for one account up to a date */
export async function getAccountBalance(
  accountCode: string,
  asOfDate: Date,
  filters?: { counterpartyId?: string; warehouseId?: string }
): Promise<{ debit: number; credit: number; balance: number }> {
  const account = await db.account.findUnique({ where: { code: accountCode } });
  if (!account) {
    console.log(`[BALANCE SHEET DEBUG] Account ${accountCode} NOT FOUND`);
    return { debit: 0, credit: 0, balance: 0 };
  }

  // IMPORTANT: Exclude both reversed entries (isReversed=true) AND reversal entries (reversedById != null)
  // A reversal entry (сторно) has reversedById pointing to the original entry
  // The original entry has isReversed=true
  // Both should be excluded from balance calculations
  const where: Record<string, unknown> = {
    accountId: account.id,
    entry: {
      date: { lte: asOfDate },
      isReversed: false,
      reversedById: null,  // Exclude reversal entries (сторно)
    },
  };
  if (filters?.counterpartyId) where.counterpartyId = filters.counterpartyId;
  if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

  const agg = await db.ledgerLine.aggregate({
    _sum: { debit: true, credit: true },
    where,
  });

  const debit = toNumber(agg._sum.debit);
  const credit = toNumber(agg._sum.credit);
  console.log(`[BALANCE SHEET DEBUG] getAccountBalance(${accountCode}): accountId=${account.id}, debit=${debit}, credit=${credit}, balance=${debit - credit}`);
  return { debit, credit, balance: debit - credit };
}

/** Get turnover (period movements) for one account */
export async function getAccountTurnovers(
  accountCode: string,
  dateFrom: Date,
  dateTo: Date,
  filters?: { counterpartyId?: string; warehouseId?: string }
): Promise<{ debit: number; credit: number }> {
  const account = await db.account.findUnique({ where: { code: accountCode } });
  if (!account) return { debit: 0, credit: 0 };

  const where: Record<string, unknown> = {
    accountId: account.id,
    entry: {
      date: { gte: dateFrom, lte: dateTo },
      isReversed: false,
      reversedById: null,  // Exclude reversal entries (сторно)
    },
  };
  if (filters?.counterpartyId) where.counterpartyId = filters.counterpartyId;
  if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

  const agg = await db.ledgerLine.aggregate({
    _sum: { debit: true, credit: true },
    where,
  });

  return {
    debit: toNumber(agg._sum.debit),
    credit: toNumber(agg._sum.credit),
  };
}

/** Convenience: credit turnover only */
export async function getCreditTurnover(accountCode: string, dateFrom: Date, dateTo: Date): Promise<number> {
  return (await getAccountTurnovers(accountCode, dateFrom, dateTo)).credit;
}

/** Convenience: debit turnover only */
export async function getDebitTurnover(accountCode: string, dateFrom: Date, dateTo: Date): Promise<number> {
  return (await getAccountTurnovers(accountCode, dateFrom, dateTo)).debit;
}

/**
 * Trial balance (Оборотно-сальдовая ведомость) for all active accounts
 */
export async function getTrialBalance(
  dateFrom: Date,
  dateTo: Date
): Promise<AccountBalanceResult[]> {
  const accounts = await db.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });

  const results: AccountBalanceResult[] = [];

  for (const account of accounts) {
    // Opening balance (before dateFrom)
    const openingAgg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        entry: { date: { lt: dateFrom }, isReversed: false, reversedById: null },
      },
    });

    // Period turnovers
    const periodAgg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        entry: { date: { gte: dateFrom, lte: dateTo }, isReversed: false, reversedById: null },
      },
    });

    const openingDebit = toNumber(openingAgg._sum.debit);
    const openingCredit = toNumber(openingAgg._sum.credit);
    const periodDebit = toNumber(periodAgg._sum.debit);
    const periodCredit = toNumber(periodAgg._sum.credit);

    const closingDebit = openingDebit + periodDebit;
    const closingCredit = openingCredit + periodCredit;
    const balance = closingDebit - closingCredit;

    // Skip accounts with no activity
    if (
      openingDebit === 0 &&
      openingCredit === 0 &&
      periodDebit === 0 &&
      periodCredit === 0
    ) {
      continue;
    }

    results.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
      balance,
    });
  }

  return results;
}

/**
 * Get balance for a specific account by code, returns net balance
 * Positive = debit balance (asset), Negative = credit balance (liability/equity)
 */
export async function getNetBalance(accountCode: string, asOfDate: Date): Promise<number> {
  return (await getAccountBalance(accountCode, asOfDate)).balance;
}

/**
 * Get sum of multiple accounts' balances
 */
export async function sumAccountBalances(
  accountCodes: string[],
  asOfDate: Date
): Promise<number> {
  console.log(`[BALANCE SHEET DEBUG] sumAccountBalances called for codes: ${accountCodes.join(', ')} as of ${asOfDate.toISOString()}`);
  let total = 0;
  for (const code of accountCodes) {
    const balance = await getNetBalance(code, asOfDate);
    console.log(`[BALANCE SHEET DEBUG]   Account ${code}: balance=${balance}`);
    total += balance;
  }
  console.log(`[BALANCE SHEET DEBUG] sumAccountBalances total: ${total}`);
  return total;
}

/**
 * Cash Flow report (Отчет о движении денежных средств, Форма 4)
 * РСБУ — calculated from cash account turnovers (50, 51, 52)
 *
 * Operating activities: payments to/from counterparties
 * Investing activities: asset purchases / proceeds
 * Financing activities: loans, equity
 */

import { getAccountBalance, getAccountTurnovers } from "@/lib/modules/accounting/balances";

export async function generateCashFlow(dateFrom: Date, dateTo: Date) {
  // Opening and closing balances of cash accounts
  const openingDate = new Date(dateFrom.getTime() - 1);

  const [opening50, opening51, opening52] = await Promise.all([
    getAccountBalance("50", openingDate),
    getAccountBalance("51", openingDate),
    getAccountBalance("52", openingDate),
  ]);

  const [closing50, closing51, closing52] = await Promise.all([
    getAccountBalance("50", dateTo),
    getAccountBalance("51", dateTo),
    getAccountBalance("52", dateTo),
  ]);

  const openingBalance =
    opening50.balance + opening51.balance + opening52.balance;
  const closingBalance =
    closing50.balance + closing51.balance + closing52.balance;

  // Cash inflows/outflows (using 51 as primary — расчетный счет)
  const [turnovers50, turnovers51, turnovers52] = await Promise.all([
    getAccountTurnovers("50", dateFrom, dateTo),
    getAccountTurnovers("51", dateFrom, dateTo),
    getAccountTurnovers("52", dateFrom, dateTo),
  ]);

  const totalInflows =
    turnovers50.debit + turnovers51.debit + turnovers52.debit;
  const totalOutflows =
    turnovers50.credit + turnovers51.credit + turnovers52.credit;
  const netCashFlow = totalInflows - totalOutflows;

  // Verify: closingBalance should equal openingBalance + netCashFlow
  const balanced =
    Math.abs(closingBalance - (openingBalance + netCashFlow)) < 0.01;

  return {
    dateFrom,
    dateTo,
    openingBalance,
    closingBalance,
    inflows: {
      cash: turnovers50.debit,
      bank: turnovers51.debit,
      forex: turnovers52.debit,
      total: totalInflows,
    },
    outflows: {
      cash: turnovers50.credit,
      bank: turnovers51.credit,
      forex: turnovers52.credit,
      total: totalOutflows,
    },
    netCashFlow,
    balanced,
  };
}

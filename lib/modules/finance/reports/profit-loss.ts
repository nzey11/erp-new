/**
 * Profit & Loss report (Отчет о прибылях и убытках, Форма 2)
 * РСБУ — calculated from LedgerLine turnovers
 *
 * Revenue  = кредитовый оборот по 90.1
 * COGS     = дебетовый оборот по 90.2 (НЕ по документам закупки!)
 * GrossProfit = Revenue - COGS
 * SellingExpenses = дебетовый оборот по 44
 * OperatingProfit = GrossProfit - SellingExpenses
 * OtherIncome    = кредитовый оборот по 91.1
 * OtherExpenses  = дебетовый оборот по 91.2
 * ProfitBeforeTax = OperatingProfit + OtherIncome - OtherExpenses
 * IncomeTax       = дебетовый оборот по 68.04 (ОСНО)
 * NetProfit = ProfitBeforeTax - IncomeTax
 */

import { getCreditTurnover, getDebitTurnover } from "@/lib/modules/accounting/balances";

export async function generateProfitLoss(dateFrom: Date, dateTo: Date) {
  const [
    revenue,
    cogs,
    vatOnSales,
    sellingExpenses,
    otherIncome,
    otherExpenses,
    incomeTax,
  ] = await Promise.all([
    getCreditTurnover("90.1", dateFrom, dateTo),
    getDebitTurnover("90.2", dateFrom, dateTo),
    getDebitTurnover("90.3", dateFrom, dateTo),
    getDebitTurnover("44", dateFrom, dateTo),
    getCreditTurnover("91.1", dateFrom, dateTo),
    getDebitTurnover("91.2", dateFrom, dateTo),
    getDebitTurnover("68.04", dateFrom, dateTo),
  ]);

  // Net revenue excludes VAT (if OSNO it's already in 90.3)
  const netRevenue = revenue - vatOnSales;
  const grossProfit = netRevenue - cogs;
  const operatingProfit = grossProfit - sellingExpenses;
  const profitBeforeTax = operatingProfit + otherIncome - otherExpenses;
  const netProfit = profitBeforeTax - incomeTax;

  return {
    dateFrom,
    dateTo,
    revenue,
    vatOnSales,
    netRevenue,
    cogs,
    grossProfit,
    grossMarginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    sellingExpenses,
    operatingProfit,
    otherIncome,
    otherExpenses,
    profitBeforeTax,
    incomeTax,
    netProfit,
    netMarginPct: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0,
  };
}

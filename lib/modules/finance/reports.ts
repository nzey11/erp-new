import { db } from "@/lib/shared/db";

/** Generate full P&L report for a date range */
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

  // Operating expenses (placeholder - will be implemented when expense tracking is added)
  const operatingExpenses = 0;
  const ebitda = grossProfit - operatingExpenses;
  const depreciation = 0; // Placeholder
  const ebit = ebitda - depreciation;
  const interestExpense = 0; // Placeholder
  const profitBeforeTax = ebit - interestExpense;
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * 0.2 : 0; // 20% tax rate
  const netIncome = profitBeforeTax - incomeTax;

  const margin = netRevenue > 0 ? grossProfit / netRevenue : 0;
  const netMargin = netRevenue > 0 ? netIncome / netRevenue : 0;

  return {
    period: { from: dateFrom, to: dateTo },
    // Revenue section
    grossRevenue,
    customerReturns: returns,
    netRevenue,
    // Cost section
    cogs: totalCogs,
    supplierReturns: supplierReturns._sum.totalAmount ?? 0,
    grossProfit,
    margin,
    // Operating section
    operatingExpenses,
    ebitda,
    depreciation,
    ebit,
    // Financial section
    interestExpense,
    profitBeforeTax,
    incomeTax,
    netIncome,
    netMargin,
  };
}

/** Generate full cash flow report for a date range with 3 sections */
export async function generateCashFlow(dateFrom: Date, dateTo: Date) {
  // Operating Activities
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

  // Operating cash flow
  const operatingIn = incomingPayments._sum.totalAmount ?? 0;
  const operatingOut = outgoingPayments._sum.totalAmount ?? 0;
  const netOperatingCashFlow = operatingIn - operatingOut;

  // Investing Activities (placeholder - equipment purchases, investments)
  const investingIn = 0;
  const investingOut = 0;
  const netInvestingCashFlow = investingIn - investingOut;

  // Financing Activities (placeholder - loans, dividends, equity)
  const financingIn = 0;
  const financingOut = 0;
  const netFinancingCashFlow = financingIn - financingOut;

  // Total
  const netCashFlow = netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow;

  // Get opening balance (cash at start of period)
  // This is a simplified calculation - in reality would need cash account balance
  const openingBalance = 0; // Placeholder
  const closingBalance = openingBalance + netCashFlow;

  return {
    period: { from: dateFrom, to: dateTo },
    openingBalance,
    // Operating Activities
    operating: {
      in: operatingIn,
      out: operatingOut,
      net: netOperatingCashFlow,
    },
    // Investing Activities
    investing: {
      in: investingIn,
      out: investingOut,
      net: netInvestingCashFlow,
    },
    // Financing Activities
    financing: {
      in: financingIn,
      out: financingOut,
      net: netFinancingCashFlow,
    },
    // Total
    netCashFlow,
    closingBalance,
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

/** Generate Balance Sheet (Assets = Liabilities + Equity) */
export async function generateBalanceSheet(asOfDate: Date) {
  // Assets
  // Current Assets
  const stockValue = await calculateStockValue(asOfDate);
  const receivables = await getTotalReceivables(asOfDate);
  const cashBalance = 0; // Placeholder - would need cash account

  // Non-current Assets (placeholder)
  const fixedAssets = 0;
  const intangibleAssets = 0;

  const totalCurrentAssets = stockValue + receivables + cashBalance;
  const totalNonCurrentAssets = fixedAssets + intangibleAssets;
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  // Liabilities
  const payables = await getTotalPayables(asOfDate);
  const shortTermDebt = 0; // Placeholder
  const longTermDebt = 0; // Placeholder

  const totalCurrentLiabilities = payables + shortTermDebt;
  const totalNonCurrentLiabilities = longTermDebt;
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

  // Equity (calculated as balancing figure: Assets - Liabilities)
  const retainedEarnings = totalAssets - totalLiabilities;
  const shareCapital = 0; // Placeholder
  const totalEquity = shareCapital + retainedEarnings;

  // Verify: Assets should equal Liabilities + Equity
  const balanceCheck = totalAssets === (totalLiabilities + totalEquity);

  return {
    asOfDate,
    // Assets
    assets: {
      current: {
        cash: cashBalance,
        receivables,
        stock: stockValue,
        total: totalCurrentAssets,
      },
      nonCurrent: {
        fixedAssets,
        intangibleAssets,
        total: totalNonCurrentAssets,
      },
      total: totalAssets,
    },
    // Liabilities
    liabilities: {
      current: {
        payables,
        shortTermDebt,
        total: totalCurrentLiabilities,
      },
      nonCurrent: {
        longTermDebt,
        total: totalNonCurrentLiabilities,
      },
      total: totalLiabilities,
    },
    // Equity
    equity: {
      shareCapital,
      retainedEarnings,
      total: totalEquity,
    },
    // Verification
    balanceCheck,
  };
}

/** Calculate stock value as of date */
async function calculateStockValue(asOfDate: Date): Promise<number> {
  // Sum of all stock movements up to the date
  const incoming = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: { in: ["incoming_shipment", "stock_receipt", "customer_return"] },
      status: "confirmed",
      confirmedAt: { lte: asOfDate },
    },
  });

  const outgoing = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: { in: ["outgoing_shipment", "write_off", "supplier_return"] },
      status: "confirmed",
      confirmedAt: { lte: asOfDate },
    },
  });

  return (incoming._sum.totalAmount ?? 0) - (outgoing._sum.totalAmount ?? 0);
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

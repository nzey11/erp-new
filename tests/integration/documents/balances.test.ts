/**
 * Integration tests for:
 *   lib/modules/accounting/balances.ts  — ledger query functions
 *   lib/modules/finance/reports/profit-loss.ts   — Form 2
 *   lib/modules/finance/reports/cash-flow.ts     — Form 4
 *   lib/modules/finance/reports/balance-sheet.ts — Form 1
 *
 * All tests seed LedgerLine records directly via Prisma to avoid coupling
 * with document-confirmation flows.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { cleanDatabase, getTestDb } from "../../helpers/test-db";
import { seedTestAccounts, seedReportAccounts } from "../../helpers/factories";
import {
  getAccountBalance,
  getAccountTurnovers,
  getCreditTurnover,
  getDebitTurnover,
  getTrialBalance,
  sumAccountBalances,
} from "@/lib/modules/accounting/balances";
import { generateProfitLoss } from "@/lib/modules/finance/reports/profit-loss";
import { generateCashFlow } from "@/lib/modules/finance/reports/cash-flow";
import { generateBalanceSheet } from "@/lib/modules/finance/reports/balance-sheet";
import { AccountType, AccountCategory } from "@/lib/generated/prisma/client";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a JournalEntry with ledger lines, resolving account codes to IDs */
async function createEntry(params: {
  number: string;
  date: Date;
  lines: { code: string; debit: number; credit: number }[];
  isReversed?: boolean;
}) {
  const db = getTestDb();
  const accounts = await db.account.findMany({
    where: { code: { in: params.lines.map((l) => l.code) } },
  });
  const codeToId = new Map(accounts.map((a) => [a.code, a.id]));

  return db.journalEntry.create({
    data: {
      number: params.number,
      date: params.date,
      isReversed: params.isReversed ?? false,
      lines: {
        create: params.lines.map((l) => ({
          accountId: codeToId.get(l.code)!,
          debit: l.debit,
          credit: l.credit,
        })),
      },
    },
  });
}

/** Create extra account not in MINIMAL_ACCOUNTS or REPORT_ACCOUNTS (edge-case tests only) */
async function mkAccount(code: string, name: string) {
  const db = getTestDb();
  return db.account.upsert({
    where: { code },
    update: {},
    create: { code, name, type: AccountType.active, category: AccountCategory.asset, isActive: true },
  });
}

// ─── balances.ts ──────────────────────────────────────────────────────────────

describe("accounting/balances — getAccountBalance", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestAccounts();
  });

  it("returns zeros for an unknown account code", async () => {
    const result = await getAccountBalance("99.99", new Date());
    expect(result).toEqual({ debit: 0, credit: 0, balance: 0 });
  });

  it("returns correct debit/credit/balance from ledger lines", async () => {
    await createEntry({
      number: "JE-GB-001",
      date: new Date("2025-06-01"),
      lines: [
        { code: "41.1", debit: 1000, credit: 0 },
        { code: "60",   debit: 0,    credit: 1000 },
      ],
    });
    const result = await getAccountBalance("41.1", new Date("2025-12-31"));
    expect(result.debit).toBe(1000);
    expect(result.credit).toBe(0);
    expect(result.balance).toBe(1000);
  });

  it("excludes lines from reversed entries", async () => {
    await createEntry({
      number: "JE-GB-002",
      date: new Date("2025-06-01"),
      isReversed: true,
      lines: [{ code: "41.1", debit: 500, credit: 0 }],
    });
    const result = await getAccountBalance("41.1", new Date("2025-12-31"));
    expect(result.debit).toBe(0);
  });

  it("excludes lines with entry date after asOfDate", async () => {
    await createEntry({ number: "JE-GB-003", date: new Date("2025-01-15"), lines: [{ code: "41.1", debit: 300, credit: 0 }] });
    await createEntry({ number: "JE-GB-004", date: new Date("2025-12-31"), lines: [{ code: "41.1", debit: 700, credit: 0 }] });
    const result = await getAccountBalance("41.1", new Date("2025-06-30"));
    expect(result.debit).toBe(300);
  });

  it("accumulates multiple entries for the same account", async () => {
    await createEntry({ number: "JE-GB-005", date: new Date("2025-02-01"), lines: [{ code: "51", debit: 2000, credit: 0 }] });
    await createEntry({ number: "JE-GB-006", date: new Date("2025-05-01"), lines: [{ code: "51", debit: 0, credit: 800 }] });
    const result = await getAccountBalance("51", new Date("2025-12-31"));
    expect(result.debit).toBe(2000);
    expect(result.credit).toBe(800);
    expect(result.balance).toBe(1200);
  });
});

describe("accounting/balances — getAccountTurnovers", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestAccounts();
  });

  it("returns zeros for unknown account code", async () => {
    const result = await getAccountTurnovers("99.99", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toEqual({ debit: 0, credit: 0 });
  });

  it("includes only movements within dateFrom..dateTo", async () => {
    // before period
    await createEntry({ number: "JE-TO-001", date: new Date("2024-12-31"), lines: [{ code: "90.1", debit: 0, credit: 100 }] });
    // within period
    await createEntry({ number: "JE-TO-002", date: new Date("2025-06-15"), lines: [{ code: "90.1", debit: 0, credit: 500 }] });
    // after period
    await createEntry({ number: "JE-TO-003", date: new Date("2026-01-01"), lines: [{ code: "90.1", debit: 0, credit: 200 }] });
    const result = await getAccountTurnovers("90.1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result.credit).toBe(500);
    expect(result.debit).toBe(0);
  });

  it("getCreditTurnover returns credit portion only", async () => {
    await createEntry({
      number: "JE-TO-004",
      date: new Date("2025-03-01"),
      lines: [{ code: "90.1", debit: 50, credit: 800 }],
    });
    const credit = await getCreditTurnover("90.1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(credit).toBe(800);
  });

  it("getDebitTurnover returns debit portion only", async () => {
    await createEntry({
      number: "JE-TO-005",
      date: new Date("2025-04-01"),
      lines: [{ code: "90.2", debit: 400, credit: 0 }],
    });
    const debit = await getDebitTurnover("90.2", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(debit).toBe(400);
  });

  it("excludes reversed entries from turnovers", async () => {
    await createEntry({
      number: "JE-TO-006",
      date: new Date("2025-06-01"),
      isReversed: true,
      lines: [{ code: "90.1", debit: 0, credit: 9999 }],
    });
    const result = await getAccountTurnovers("90.1", new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result.credit).toBe(0);
  });
});

describe("accounting/balances — getTrialBalance", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestAccounts();
  });

  it("returns empty array when there is no ledger activity", async () => {
    const result = await getTrialBalance(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toHaveLength(0);
  });

  it("returns account with correct opening/period/closing split", async () => {
    // opening: before period
    await createEntry({ number: "JE-TB-001", date: new Date("2024-12-15"), lines: [{ code: "41.1", debit: 200, credit: 0 }] });
    // period
    await createEntry({ number: "JE-TB-002", date: new Date("2025-06-15"), lines: [{ code: "41.1", debit: 300, credit: 100 }] });

    const result = await getTrialBalance(new Date("2025-01-01"), new Date("2025-12-31"));
    const row = result.find((r) => r.accountCode === "41.1");
    expect(row).toBeDefined();
    expect(row!.openingDebit).toBe(200);
    expect(row!.openingCredit).toBe(0);
    expect(row!.periodDebit).toBe(300);
    expect(row!.periodCredit).toBe(100);
    expect(row!.closingDebit).toBe(500);
    expect(row!.closingCredit).toBe(100);
  });

  it("skips accounts with no activity at all", async () => {
    // only seed 90.1 with activity
    await createEntry({ number: "JE-TB-003", date: new Date("2025-03-01"), lines: [{ code: "90.1", debit: 0, credit: 1000 }] });
    const result = await getTrialBalance(new Date("2025-01-01"), new Date("2025-12-31"));
    const active = result.map((r) => r.accountCode);
    expect(active).toContain("90.1");
    expect(active).not.toContain("41.1"); // no activity
  });

  it("includes accountCode and accountName in result", async () => {
    await createEntry({ number: "JE-TB-004", date: new Date("2025-01-10"), lines: [{ code: "62", debit: 500, credit: 0 }] });
    const result = await getTrialBalance(new Date("2025-01-01"), new Date("2025-12-31"));
    const row = result.find((r) => r.accountCode === "62");
    expect(row!.accountName).toBeTruthy();
    expect(row!.accountId).toBeTruthy();
  });
});

describe("accounting/balances — sumAccountBalances", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestAccounts();
  });

  it("returns 0 for empty code array", async () => {
    const total = await sumAccountBalances([], new Date());
    expect(total).toBe(0);
  });

  it("sums balances across multiple account codes", async () => {
    await createEntry({
      number: "JE-SUM-001",
      date: new Date("2025-01-01"),
      lines: [
        { code: "50", debit: 1000, credit: 0 },
        { code: "51", debit: 2000, credit: 0 },
      ],
    });
    const total = await sumAccountBalances(["50", "51"], new Date("2025-12-31"));
    expect(total).toBe(3000);
  });

  it("returns 0 for unknown codes", async () => {
    const total = await sumAccountBalances(["99.88", "99.89"], new Date());
    expect(total).toBe(0);
  });
});

// ─── finance reports ──────────────────────────────────────────────────────────
// All report suites use seedReportAccounts() which is a superset of
// seedTestAccounts() and includes ALL РСБУ Form 1/2/4 account codes.
// This prevents false-green tests caused by graceful-zero returns when
// a required account simply doesn't exist in the DB.

describe("finance/reports — generateProfitLoss (Form 2)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedReportAccounts();
  });

  it("returns all zeros with no ledger data", async () => {
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.revenue).toBe(0);
    expect(report.cogs).toBe(0);
    expect(report.netProfit).toBe(0);
    expect(report.grossMarginPct).toBe(0);
    expect(report.netMarginPct).toBe(0);
  });

  it("calculates netRevenue = revenue − vatOnSales, grossProfit = netRevenue − cogs", async () => {
    await createEntry({
      number: "JE-PL-001",
      date: new Date("2025-06-01"),
      lines: [
        { code: "90.1", debit: 0,   credit: 1200 }, // revenue
        { code: "90.3", debit: 200, credit: 0    }, // VAT on sales
        { code: "90.2", debit: 800, credit: 0    }, // COGS
      ],
    });
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.revenue).toBe(1200);
    expect(report.vatOnSales).toBe(200);
    expect(report.netRevenue).toBe(1000);
    expect(report.cogs).toBe(800);
    expect(report.grossProfit).toBe(200);
  });

  it("selling expenses (44) reduce operatingProfit", async () => {
    await createEntry({
      number: "JE-PL-002",
      date: new Date("2025-07-01"),
      lines: [
        { code: "90.1", debit: 0,   credit: 1000 },
        { code: "44",   debit: 150, credit: 0    },
      ],
    });
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.sellingExpenses).toBe(150);
    // grossProfit = 1000 (no COGS, no VAT), operatingProfit = 1000 - 150 = 850
    expect(report.operatingProfit).toBe(850);
  });

  it("income tax (68.04) reduces netProfit", async () => {
    await createEntry({
      number: "JE-PL-003",
      date: new Date("2025-08-01"),
      lines: [
        { code: "90.1",  debit: 0,   credit: 2000 }, // revenue
        { code: "68.04", debit: 400, credit: 0    }, // income tax
      ],
    });
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.incomeTax).toBe(400);
    // profitBeforeTax = 2000, netProfit = 2000 - 400 = 1600
    expect(report.netProfit).toBe(1600);
  });

  it("grossMarginPct = 0 when netRevenue = 0 (no div-by-zero)", async () => {
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.grossMarginPct).toBe(0);
    expect(report.netMarginPct).toBe(0);
  });

  it("excludes entries outside the period", async () => {
    await createEntry({ number: "JE-PL-004", date: new Date("2024-12-31"), lines: [{ code: "90.1", debit: 0, credit: 999 }] });
    const report = await generateProfitLoss(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.revenue).toBe(0);
  });
});

describe("finance/reports — generateCashFlow (Form 4)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedReportAccounts();
  });

  it("returns zeros and balanced=true with no cash activity", async () => {
    const report = await generateCashFlow(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.openingBalance).toBe(0);
    expect(report.closingBalance).toBe(0);
    expect(report.netCashFlow).toBe(0);
    expect(report.balanced).toBe(true);
  });

  it("tracks bank account (51) inflows and outflows with balanced invariant", async () => {
    // Opening balance
    await createEntry({ number: "JE-CF-001", date: new Date("2024-12-31"), lines: [{ code: "51", debit: 5000, credit: 0 }] });
    // Inflow
    await createEntry({ number: "JE-CF-002", date: new Date("2025-06-01"), lines: [{ code: "51", debit: 3000, credit: 0 }] });
    // Outflow
    await createEntry({ number: "JE-CF-003", date: new Date("2025-07-01"), lines: [{ code: "51", debit: 0, credit: 1000 }] });

    const report = await generateCashFlow(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.openingBalance).toBe(5000);
    expect(report.inflows.bank).toBe(3000);
    expect(report.outflows.bank).toBe(1000);
    expect(report.netCashFlow).toBe(2000);
    expect(report.closingBalance).toBe(7000);
    expect(report.balanced).toBe(true);
  });

  it("tracks cash register (50), bank (51), and forex (52) separately", async () => {
    await createEntry({ number: "JE-CF-004", date: new Date("2025-03-01"), lines: [{ code: "50", debit: 400,  credit: 0 }] });
    await createEntry({ number: "JE-CF-005", date: new Date("2025-03-01"), lines: [{ code: "51", debit: 600,  credit: 0 }] });
    await createEntry({ number: "JE-CF-006", date: new Date("2025-03-01"), lines: [{ code: "52", debit: 1000, credit: 0 }] });

    const report = await generateCashFlow(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.inflows.cash).toBe(400);
    expect(report.inflows.bank).toBe(600);
    expect(report.inflows.forex).toBe(1000);
    expect(report.inflows.total).toBe(2000);
  });

  it("netCashFlow = inflows.total − outflows.total", async () => {
    await createEntry({ number: "JE-CF-007", date: new Date("2025-05-01"), lines: [{ code: "51", debit: 2000, credit: 500 }] });
    const report = await generateCashFlow(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(report.netCashFlow).toBe(1500);
  });
});

describe("finance/reports — generateBalanceSheet (Form 1)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedReportAccounts();
  });

  it("returns zero totals and balanced=true with no ledger data", async () => {
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.assets.total).toBe(0);
    expect(report.totalPassive).toBe(0);
    expect(report.balanced).toBe(true);
  });

  it("inventory (account 41) appears in current assets", async () => {
    // Note: balance-sheet.ts uses code '41', NOT '41.1'
    await createEntry({ number: "JE-BS-001", date: new Date("2025-06-01"), lines: [{ code: "41", debit: 3000, credit: 0 }] });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.assets.current.inventory).toBe(3000);
  });

  it("fixed assets net of depreciation: Дт 01 − Кт 02", async () => {
    await createEntry({
      number: "JE-BS-002",
      date: new Date("2025-04-01"),
      lines: [
        { code: "01", debit: 10000, credit: 0    }, // gross fixed assets
        { code: "02", debit: 0,     credit: 2000 }, // accumulated depreciation
      ],
    });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    // fixedAssets = max(0, balance(01) - |balance(02)|) = max(0, 10000 - 2000) = 8000
    expect(report.assets.nonCurrent.fixedAssets).toBe(8000);
  });

  it("share capital (80) appears in equity", async () => {
    await createEntry({ number: "JE-BS-003", date: new Date("2025-01-01"), lines: [{ code: "80", debit: 0, credit: 10000 }] });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.equity.shareCapital).toBe(10000);
  });

  it("balanced = true when asset = equity + liabilities (cash funded by share capital)", async () => {
    // Classic founding entry: Дт 51 (asset) Кт 80 (equity)
    await createEntry({
      number: "JE-BS-004",
      date: new Date("2025-01-15"),
      lines: [
        { code: "51", debit: 50000, credit: 0     }, // bank → asset
        { code: "80", debit: 0,     credit: 50000 }, // share capital → equity
      ],
    });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.assets.current.cash).toBeGreaterThanOrEqual(50000);
    expect(report.equity.shareCapital).toBe(50000);
    // The fundamental balance equation must hold
    expect(report.balanced).toBe(true);
  });

  it("payables (account 60 credit balance) appear in current liabilities", async () => {
    await createEntry({
      number: "JE-BS-005",
      date: new Date("2025-06-01"),
      lines: [
        { code: "41", debit: 1500, credit: 0    },
        { code: "60", debit: 0,    credit: 1500 },
      ],
    });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.liabilities.current.payables).toBe(1500);
  });

  it("does not count future entries in balance sheet", async () => {
    await createEntry({ number: "JE-BS-006", date: new Date("2026-01-15"), lines: [{ code: "51", debit: 99999, credit: 0 }] });
    const report = await generateBalanceSheet(new Date("2025-12-31"));
    expect(report.assets.current.cash).toBe(0);
  });
});

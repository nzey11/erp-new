/**
 * Journal Integration Tests
 *
 * Covers the double-entry bookkeeping engine:
 *   createJournalEntry  — manual entries, balance invariant
 *   autoPostDocument    — idempotency, no-op for non-posting types
 *   reverseEntry        — storno, double-reversal guard
 *   autoPostPayment     — correct account codes for income/expense
 *
 * Infrastructure:
 *   - tests/setup.ts runs cleanDatabase() (which now includes journalEntry)
 *     before every test automatically.
 *   - seedTestAccounts() / seedTenantSettings() seed static system data
 *     once per suite in beforeAll — Account rows survive cleanDatabase().
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  createJournalEntry,
  autoPostDocument,
  reverseEntry,
  autoPostPayment,
  CannotReverseAutoEntryError,
  RestrictedAccountPermissionError,
} from "@/lib/modules/accounting/finance/journal";
import {
  createDocument,
  createDocumentItem,
  createProduct,
  createWarehouse,
  seedTestAccounts,
  seedTenantSettings,
  createTenant,
} from "../../helpers/factories";

// Account IDs shared across suites (seeded in beforeAll, survive cleanDatabase)
let accountIds: Record<string, string>;

// =============================================
// createJournalEntry
// =============================================

describe("Journal — createJournalEntry", () => {
  let testTenantId: string;

  beforeAll(async () => {
    accountIds = await seedTestAccounts();
    const tenant = await createTenant({ id: "test-journal-tenant" });
    testTenantId = tenant.id;
    await seedTenantSettings(testTenantId, accountIds);
  });

  // cleanDatabase() runs before each test via tests/setup.ts
  // → journalEntry rows are wiped, accounts persist

  it("creates entry with correct number format and metadata", async () => {
    const entry = await createJournalEntry(
      {
        description: "Test entry",
        isManual: true,
        sourceType: "test",
        sourceId: "src-001",
        lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 1000 }],
      }
    );

    expect(entry.number).toMatch(/^JE-\d{6}$/);
    expect(entry.isManual).toBe(true);
    expect(entry.sourceType).toBe("test");
    expect(entry.sourceId).toBe("src-001");
  });

  it("creates balanced ledger lines: sum(debit) == sum(credit)", async () => {
    const entry = await createJournalEntry(
      { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 2500 }], isManual: true }
    );

    expect(entry.lines).toHaveLength(2);

    const totalDebit  = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(2500);
  });

  it("debit line has correct accountId and amount", async () => {
    const entry = await createJournalEntry(
      { lines: [{ debitAccountCode: "41.1", creditAccountCode: "60", amount: 5000 }], isManual: true },
      { allowRestrictedAccounts: true }
    );

    const debitLine  = entry.lines.find(l => Number(l.debit) > 0)!;
    const creditLine = entry.lines.find(l => Number(l.credit) > 0)!;

    expect(debitLine.accountId).toBe(accountIds["41.1"]);
    expect(Number(debitLine.debit)).toBe(5000);
    expect(Number(debitLine.credit)).toBe(0);

    expect(creditLine.accountId).toBe(accountIds["60"]);
    expect(Number(creditLine.credit)).toBe(5000);
    expect(Number(creditLine.debit)).toBe(0);
  });

  it("multi-line entry: all lines created, totals balanced", async () => {
    const entry = await createJournalEntry(
      {
        lines: [
          { debitAccountCode: "41.1", creditAccountCode: "60",   amount: 3000 },
          { debitAccountCode: "62",   creditAccountCode: "90.1", amount: 2000 },
        ],
        isManual: true,
      },
      { allowRestrictedAccounts: true }
    );

    expect(entry.lines).toHaveLength(4); // 2 pairs

    const totalDebit  = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(5000);
    expect(totalCredit).toBe(5000);
  });

  it("throws when debit account code does not exist", async () => {
    await expect(
      createJournalEntry(
        { lines: [{ debitAccountCode: "NOTEXIST", creditAccountCode: "91.1", amount: 100 }], isManual: true }
      )
    ).rejects.toThrow("Debit account not found: NOTEXIST");
  });

  it("throws when credit account code does not exist", async () => {
    await expect(
      createJournalEntry(
        { lines: [{ debitAccountCode: "50", creditAccountCode: "NOTEXIST", amount: 100 }], isManual: true }
      )
    ).rejects.toThrow("Credit account not found: NOTEXIST");
  });

  it("persists entry to DB — findUnique by id returns correct record", async () => {
    const entry = await createJournalEntry(
      { description: "Persistence check", lines: [{ debitAccountCode: "62", creditAccountCode: "90.1", amount: 800 }], isManual: true },
      { allowRestrictedAccounts: true }
    );

    const fromDb = await db.journalEntry.findUnique({
      where: { id: entry.id },
      include: { lines: true },
    });

    expect(fromDb).not.toBeNull();
    expect(fromDb!.description).toBe("Persistence check");
    expect(fromDb!.lines).toHaveLength(2);
  });
});

// =============================================
// autoPostDocument
// =============================================

describe("Journal — autoPostDocument", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let testTenantId: string;

  beforeAll(async () => {
    // Seed system data once — Account and TenantSettings survive cleanDatabase()
    accountIds = await seedTestAccounts();
    const tenant = await createTenant({ id: "test-autopost-tenant" });
    testTenantId = tenant.id;
    await seedTenantSettings(testTenantId, accountIds);
  });

  beforeEach(async () => {
    // Operational data (warehouse, product) is cleaned by global beforeEach → recreate
    warehouse = await createWarehouse();
    product   = await createProduct();
  });

  it("creates a journal entry for incoming_shipment document", async () => {
    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      totalAmount: 5000,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });

    await autoPostDocument(doc.id, doc.number, doc.date);

    const entries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      include: { lines: true },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].sourceType).toBe("incoming_shipment");
    expect(entries[0].isManual).toBe(false);
    expect(entries[0].lines.length).toBeGreaterThan(0);

    // Balance invariant must hold
    const totalDebit  = entries[0].lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = entries[0].lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("idempotent: second call for same document creates no second entry", async () => {
    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      totalAmount: 5000,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });

    await autoPostDocument(doc.id, doc.number, doc.date);
    await autoPostDocument(doc.id, doc.number, doc.date); // duplicate call

    const entries = await db.journalEntry.findMany({ where: { sourceId: doc.id } });
    expect(entries).toHaveLength(1);
  });

  it("no entry created for non-posting document type (purchase_order)", async () => {
    const doc = await createDocument({
      type: "purchase_order",
      status: "confirmed",
      warehouseId: warehouse.id,
      totalAmount: 1000,
    });

    await autoPostDocument(doc.id, doc.number, doc.date);

    const entries = await db.journalEntry.findMany({ where: { sourceId: doc.id } });
    expect(entries).toHaveLength(0);
  });
});

// =============================================
// reverseEntry
// =============================================

describe("Journal — reverseEntry", () => {
  let testTenantId: string;

  beforeAll(async () => {
    accountIds = await seedTestAccounts();
    const tenant = await createTenant({ id: "test-reverse-tenant" });
    testTenantId = tenant.id;
    await seedTenantSettings(testTenantId, accountIds);
  });

  it("creates reversal with swapped debit/credit", async () => {
    const original = await createJournalEntry(
      { lines: [{ debitAccountCode: "41.1", creditAccountCode: "60", amount: 3000 }], isManual: true },
      { allowRestrictedAccounts: true }
    );

    const reversal = await reverseEntry(original.id, { allowRestrictedAccounts: true });

    expect(reversal.lines).toHaveLength(2);

    // The account that was debited in original must be credited in reversal
    const origDebitAccountId = original.lines.find(l => Number(l.debit) > 0)!.accountId;
    const reversalLine = reversal.lines.find(l => l.accountId === origDebitAccountId)!;

    expect(Number(reversalLine.debit)).toBe(0);
    expect(Number(reversalLine.credit)).toBe(3000);
  });

  it("marks original entry as isReversed = true", async () => {
    const original = await createJournalEntry(
      { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 500 }], isManual: true }
    );

    await reverseEntry(original.id);

    const updated = await db.journalEntry.findUnique({ where: { id: original.id } });
    expect(updated!.isReversed).toBe(true);
  });

  it("reversal entry has reversedById set to original entry id", async () => {
    const original = await createJournalEntry(
      { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 500 }], isManual: true }
    );

    const reversal = await reverseEntry(original.id);
    expect(reversal.reversedById).toBe(original.id);
  });

  it("throws 'Entry is already reversed' on double reversal", async () => {
    const original = await createJournalEntry(
      { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 500 }], isManual: true }
    );

    await reverseEntry(original.id);

    await expect(reverseEntry(original.id)).rejects.toThrow("Entry is already reversed");
  });

  it("throws 'Journal entry not found' for non-existent id", async () => {
    await expect(reverseEntry("non-existent-id")).rejects.toThrow("Journal entry not found");
  });

  it("reversal is balanced: sum(debit) == sum(credit)", async () => {
    const original = await createJournalEntry(
      {
        lines: [
          { debitAccountCode: "41.1", creditAccountCode: "60",   amount: 3000 },
          { debitAccountCode: "62",   creditAccountCode: "90.1", amount: 1500 },
        ],
        isManual: true,
      },
      { allowRestrictedAccounts: true }
    );

    const reversal = await reverseEntry(original.id, { allowRestrictedAccounts: true });

    const totalDebit  = reversal.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = reversal.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(4500);
  });
});

// =============================================
// autoPostPayment
// =============================================

describe("Journal — autoPostPayment", () => {
  let testTenantId: string;

  beforeEach(async () => {
    accountIds = await seedTestAccounts();
    const tenant = await createTenant({ id: `test-payment-tenant-${Date.now()}` });
    testTenantId = tenant.id;
    await seedTenantSettings(testTenantId, accountIds);
  });

  /** Helper: create FinanceCategory + Payment inline */
  async function makePayment(opts: {
    paymentType: "income" | "expense";
    paymentMethod: "cash" | "bank_transfer";
    amount: number;
    defaultAccountCode?: string | null;
  }) {
    const category = await db.financeCategory.create({
      data: {
        name:               `Категория ${Date.now()}_${Math.random()}`,
        type:               opts.paymentType,
        isSystem:           false,
        isActive:           true,
        defaultAccountCode: opts.defaultAccountCode ?? null,
      },
    });

    const payment = await db.payment.create({
      data: {
        number:        `PAY-${Date.now()}_${Math.random()}`,
        type:          opts.paymentType,
        categoryId:    category.id,
        amount:        opts.amount,
        paymentMethod: opts.paymentMethod,
        date:          new Date(),
        tenantId:      testTenantId,
      },
    });

    return { category, payment };
  }

  it("income + cash posts Дт 50 (Касса) Кт 91.1 (Прочие доходы)", async () => {
    const { payment } = await makePayment({
      paymentType: "income", paymentMethod: "cash", amount: 1000,
    });

    await autoPostPayment(payment.id);

    const entries = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
      include: { lines: true },
    });

    expect(entries).toHaveLength(1);
    const debitLine  = entries[0].lines.find(l => Number(l.debit) > 0)!;
    const creditLine = entries[0].lines.find(l => Number(l.credit) > 0)!;

    expect(debitLine.accountId).toBe(accountIds["50"]);    // Касса
    expect(creditLine.accountId).toBe(accountIds["91.1"]); // Прочие доходы
    expect(Number(debitLine.debit)).toBe(1000);
    expect(Number(creditLine.credit)).toBe(1000);
  });

  it("expense + bank_transfer posts Дт 91.2 (Прочие расходы) Кт 51 (Расчетный счет)", async () => {
    const { payment } = await makePayment({
      paymentType: "expense", paymentMethod: "bank_transfer", amount: 2500,
    });

    await autoPostPayment(payment.id);

    const entries = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
      include: { lines: true },
    });

    expect(entries).toHaveLength(1);
    const debitLine  = entries[0].lines.find(l => Number(l.debit) > 0)!;
    const creditLine = entries[0].lines.find(l => Number(l.credit) > 0)!;

    expect(debitLine.accountId).toBe(accountIds["91.2"]); // Прочие расходы
    expect(creditLine.accountId).toBe(accountIds["51"]);  // Расчетный счет
    expect(Number(debitLine.debit)).toBe(2500);
    expect(Number(creditLine.credit)).toBe(2500);
  });

  it("uses category.defaultAccountCode when explicitly set", async () => {
    const { payment } = await makePayment({
      paymentType: "income", paymentMethod: "cash", amount: 800,
      defaultAccountCode: "90.1", // override: use 90.1 (Выручка) instead of 91.1
    });

    await autoPostPayment(payment.id);

    const entries = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
      include: { lines: true },
    });

    const creditLine = entries[0].lines.find(l => Number(l.credit) > 0)!;
    expect(creditLine.accountId).toBe(accountIds["90.1"]); // Выручка
  });

  it("idempotent: second call for same payment creates no second entry", async () => {
    const { payment } = await makePayment({
      paymentType: "income", paymentMethod: "cash", amount: 500,
    });

    await autoPostPayment(payment.id);
    await autoPostPayment(payment.id); // duplicate call

    const entries = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
    });
    expect(entries).toHaveLength(1);
  });
});

// =============================================
// Guards: Restricted Accounts & Auto-Entry Protection
// =============================================

describe("Journal — Guards", () => {
  let testTenantId: string;

  beforeAll(async () => {
    accountIds = await seedTestAccounts();
    const tenant = await createTenant({ id: "test-guards-tenant" });
    testTenantId = tenant.id;
    await seedTenantSettings(testTenantId, accountIds);
  });

  // ---------------------------------------------
  // createJournalEntry guards
  // ---------------------------------------------

  describe("createJournalEntry — restricted accounts", () => {
    it("allows regular accounts without allowRestrictedAccounts", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 1000 }], isManual: true }
      );
      expect(entry.lines).toHaveLength(2);
    });

    it("throws RestrictedAccountPermissionError for 60* accounts without permission", async () => {
      await expect(
        createJournalEntry(
          { lines: [{ debitAccountCode: "60", creditAccountCode: "91.1", amount: 1000 }], isManual: true }
        )
      ).rejects.toThrow(RestrictedAccountPermissionError);
    });

    it("throws RestrictedAccountPermissionError for 62* accounts without permission", async () => {
      await expect(
        createJournalEntry(
          { lines: [{ debitAccountCode: "91.1", creditAccountCode: "62", amount: 1000 }], isManual: true }
        )
      ).rejects.toThrow(RestrictedAccountPermissionError);
    });

    it("allows 60* accounts with allowRestrictedAccounts option", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "60", creditAccountCode: "91.1", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );
      expect(entry.lines).toHaveLength(2);
    });

    it("allows 62* accounts with allowRestrictedAccounts option", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "91.1", creditAccountCode: "62", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );
      expect(entry.lines).toHaveLength(2);
    });
  });

  // ---------------------------------------------
  // reverseEntry guards
  // ---------------------------------------------

  describe("reverseEntry — auto-entry protection", () => {
    it("throws CannotReverseAutoEntryError for auto-generated entry", async () => {
      // Create an auto-entry via autoPostDocument
      const warehouse = await createWarehouse();
      const product = await createProduct();
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        totalAmount: 5000,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
      await autoPostDocument(doc.id, doc.number, doc.date);

      const entry = await db.journalEntry.findFirst({
        where: { sourceId: doc.id, isManual: false },
      });
      expect(entry).not.toBeNull();

      await expect(reverseEntry(entry!.id)).rejects.toThrow(CannotReverseAutoEntryError);
    });

    it("allows reverse of manual entry", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 1000 }], isManual: true }
      );
      const reversal = await reverseEntry(entry.id);
      expect(reversal.reversedById).toBe(entry.id);
    });

    it("allows reverse of auto-entry with bypassAutoCheck (document lifecycle)", async () => {
      // Create an auto-entry
      const warehouse = await createWarehouse();
      const product = await createProduct();
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        totalAmount: 5000,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
      await autoPostDocument(doc.id, doc.number, doc.date);

      const entry = await db.journalEntry.findFirst({
        where: { sourceId: doc.id, isManual: false },
      });

      // Reverse with bypassAutoCheck (simulating document lifecycle operation)
      const reversal = await reverseEntry(entry!.id, { bypassAutoCheck: true, allowRestrictedAccounts: true });
      expect(reversal.reversedById).toBe(entry!.id);
    });
  });

  describe("reverseEntry — restricted accounts", () => {
    it("throws RestrictedAccountPermissionError for 60* entry without permission", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "60", creditAccountCode: "91.1", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );

      await expect(reverseEntry(entry.id)).rejects.toThrow(RestrictedAccountPermissionError);
    });

    it("allows reverse of 60* entry with allowRestrictedAccounts option", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "60", creditAccountCode: "91.1", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );

      const reversal = await reverseEntry(entry.id, { allowRestrictedAccounts: true });
      expect(reversal.reversedById).toBe(entry.id);
    });

    it("throws RestrictedAccountPermissionError for 62* entry without permission", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "91.1", creditAccountCode: "62", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );

      await expect(reverseEntry(entry.id)).rejects.toThrow(RestrictedAccountPermissionError);
    });
  });

  // ---------------------------------------------
  // Error order tests
  // ---------------------------------------------

  describe("error order", () => {
    it("auto-entry check runs before restricted accounts check", async () => {
      // Create an auto-entry with 60* account
      const warehouse = await createWarehouse();
      const product = await createProduct();
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        totalAmount: 5000,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
      await autoPostDocument(doc.id, doc.number, doc.date);

      const entry = await db.journalEntry.findFirst({
        where: { sourceId: doc.id, isManual: false },
        include: { lines: { include: { account: true } } },
      });

      // Even if entry has restricted accounts, should throw CannotReverseAutoEntryError
      await expect(reverseEntry(entry!.id)).rejects.toThrow(CannotReverseAutoEntryError);
    });
  });
});

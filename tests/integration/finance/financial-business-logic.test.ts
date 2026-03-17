/**
 * Financial Business Logic Integration Tests
 *
 * Covers the complete financial invariants after Fix 1-4:
 *
 *   Fix 4: onDocumentConfirmedPayment fires only for payment-type docs (NOT shipments)
 *   Fix 1: cancelDocumentTransactional reverses JournalEntry (сторно)
 *   Fix 3: cancelDocumentTransactional blocks if linked Finance Payment exists
 *   Fix 2: Payment blocking also validates orphan-payment prevention
 *
 * Infrastructure:
 *   - tests/setup.ts calls cleanDatabase() before every test
 *   - Account rows survive cleanDatabase() — seeded once in beforeAll
 *   - Handlers are registered/cleared per suite to avoid registry pollution
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  cancelDocumentTransactional,
  confirmDocumentTransactional,
  DocumentCancelError,
} from "@/lib/modules/accounting/services/document-confirm.service";
import { autoPostDocument } from "@/lib/modules/accounting/finance/journal";
import { onDocumentConfirmedPayment } from "@/lib/modules/accounting/handlers/payment-handler";
import { onDocumentConfirmedJournal } from "@/lib/modules/accounting/handlers/journal-handler";
import {
  clearOutboxHandlers,
  registerOutboxHandler,
} from "@/lib/events/outbox";
import {
  resetOutboxHandlerRegistration,
} from "@/lib/events/handlers/register-outbox-handlers";
import type { DocumentConfirmedEvent } from "@/lib/events/types";
import {
  createTenant,
  createWarehouse,
  createProduct,
  createCounterparty,
  createDocument,
  createDocumentItem,
  seedTestAccounts,
  seedTenantSettings,
} from "../../helpers/factories";

// ── Stable IDs ────────────────────────────────────────────────────────────────

const TENANT_ID = "test-fin-bizlogic-tenant";

let accountIds: Record<string, string>;

// ── Global setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  accountIds = await seedTestAccounts();

  // Ensure PaymentCounter exists for payment-handler tests
  await db.paymentCounter.upsert({
    where: { prefix: "PAY" },
    create: { prefix: "PAY", lastNumber: 0 },
    update: {},
  });

  clearOutboxHandlers();
  resetOutboxHandlerRegistration();
});

afterAll(async () => {
  clearOutboxHandlers();
  resetOutboxHandlerRegistration();
});

// ── Per-test setup ────────────────────────────────────────────────────────────

beforeEach(async () => {
  await createTenant({ id: TENANT_ID });
  await seedTenantSettings(TENANT_ID, accountIds);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire onDocumentConfirmedJournal handler directly for a confirmed document. */
async function postJournalForDocument(doc: {
  id: string;
  type: string;
  number: string;
  counterpartyId: string | null;
  warehouseId: string | null;
  totalAmount: number;
  tenantId: string;
}) {
  const event: DocumentConfirmedEvent = {
    type: "DocumentConfirmed",
    occurredAt: new Date(),
    payload: {
      documentId: doc.id,
      documentType: doc.type as never,
      documentNumber: doc.number,
      counterpartyId: doc.counterpartyId,
      warehouseId: doc.warehouseId,
      totalAmount: doc.totalAmount,
      confirmedAt: new Date(),
      confirmedBy: null,
      tenantId: doc.tenantId,
    },
  };
  await onDocumentConfirmedJournal(event);
}

/** Fire onDocumentConfirmedPayment handler for a confirmed document. */
async function postPaymentHandlerForDocument(doc: {
  id: string;
  type: string;
  number: string;
  counterpartyId: string | null;
  totalAmount: number;
  tenantId: string;
}) {
  const event: DocumentConfirmedEvent = {
    type: "DocumentConfirmed",
    occurredAt: new Date(),
    payload: {
      documentId: doc.id,
      documentType: doc.type as never,
      documentNumber: doc.number,
      counterpartyId: doc.counterpartyId,
      warehouseId: null,
      totalAmount: doc.totalAmount,
      confirmedAt: new Date(),
      confirmedBy: null,
      tenantId: doc.tenantId,
    },
  };
  await onDocumentConfirmedPayment(event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Payment handler — Fix 4
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial — Fix 4: Payment handler fires only for payment-type docs", () => {
  it("incoming_shipment does NOT auto-create Finance Payment", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 10000,
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 1000 });

    const before = await db.payment.count({ where: { tenantId: TENANT_ID } });
    await postPaymentHandlerForDocument({ ...doc, totalAmount: 10000 });
    const after = await db.payment.count({ where: { tenantId: TENANT_ID } });

    expect(after).toBe(before); // No Finance Payment created
  });

  it("outgoing_shipment does NOT auto-create Finance Payment", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const customer = await createCounterparty({ type: "customer", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: customer.id,
      totalAmount: 15000,
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 5, price: 3000 });

    const before = await db.payment.count({ where: { tenantId: TENANT_ID } });
    await postPaymentHandlerForDocument({ ...doc, totalAmount: 15000 });
    const after = await db.payment.count({ where: { tenantId: TENANT_ID } });

    expect(after).toBe(before);
  });

  it("incoming_payment DOES auto-create Finance Payment", async () => {
    const customer = await createCounterparty({ type: "customer", tenantId: TENANT_ID });

    // Seed required FinanceCategory: incoming_payment → income → "Оплата от покупателя"
    // (After Fix: incoming_payment = money arrives = income, NOT expense)
    await db.financeCategory.upsert({
      where: { id: "test-cat-income" },
      create: { id: "test-cat-income", name: "Оплата от покупателя", type: "income", isActive: true },
      update: {},
    });

    const doc = await createDocument({
      type: "incoming_payment",
      status: "confirmed",
      counterpartyId: customer.id,
      totalAmount: 5000,
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, (await createProduct({ tenantId: TENANT_ID })).id, { quantity: 1, price: 5000 });

    const before = await db.payment.count({ where: { tenantId: TENANT_ID } });
    await postPaymentHandlerForDocument({ ...doc, totalAmount: 5000 });
    const after = await db.payment.count({ where: { tenantId: TENANT_ID } });

    expect(after).toBeGreaterThan(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Journal reversal on cancellation — Fix 1
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial — Fix 1: Journal reversal on document cancellation", () => {
  it("cancellation creates a reversal JournalEntry (сторно)", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    // Create confirmed document
    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 20000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 20, price: 1000 });

    // Post journal entry manually (simulates outbox handler)
    await postJournalForDocument({ ...doc, totalAmount: 20000 });

    const entriesBefore = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    expect(entriesBefore.length).toBeGreaterThanOrEqual(1);
    expect(entriesBefore.every((e) => !e.isReversed)).toBe(true);

    // Cancel the document
    await cancelDocumentTransactional(doc.id, "test-actor");

    const entriesAfter = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      include: { lines: true },
    });

    // Original entry must be marked reversed
    const original = entriesAfter.find((e) => !e.reversedById);
    expect(original?.isReversed).toBe(true);

    // Reversal entry must exist
    const reversal = entriesAfter.find((e) => !!e.reversedById);
    expect(reversal).toBeDefined();
    expect(reversal?.description).toMatch(/[Сс]торно|[Оо]тмена/);
  });

  it("net LedgerLine balance is zero after cancellation", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 8000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 8, price: 1000 });

    await postJournalForDocument({ ...doc, totalAmount: 8000 });

    await cancelDocumentTransactional(doc.id, "test-actor");

    // Get all JournalEntry ids for this document
    const entries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      select: { id: true },
    });
    const entryIds = entries.map((e) => e.id);

    // Sum all LedgerLines across original + reversal entries
    const agg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: { entryId: { in: entryIds } },
    });

    const netDebit = Number(agg._sum.debit ?? 0);
    const netCredit = Number(agg._sum.credit ?? 0);

    // Net effect must be zero
    expect(Math.abs(netDebit - netCredit)).toBeLessThan(0.01);
  });

  it("cancellation is idempotent — reversing twice does not double-reverse", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 3000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 3, price: 1000 });

    await postJournalForDocument({ ...doc, totalAmount: 3000 });

    // Cancel once
    await cancelDocumentTransactional(doc.id, "actor");

    const countAfterFirst = await db.journalEntry.count({ where: { sourceId: doc.id } });

    // Cancel again — should return early (already cancelled)
    await cancelDocumentTransactional(doc.id, "actor");

    const countAfterSecond = await db.journalEntry.count({ where: { sourceId: doc.id } });

    expect(countAfterSecond).toBe(countAfterFirst); // No new entries created
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Block cancellation if Payment exists — Fix 3
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial — Fix 3: Cancellation blocked if Finance Payment exists", () => {
  it("throws DocumentCancelError (409) when linked Payment exists", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 50000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 50, price: 1000 });

    // Seed FinanceCategory + Payment linked to this document
    // FinanceCategory has no tenantId — it's a global catalogue
    const cat = await db.financeCategory.upsert({
      where: { id: "test-cat-expense-block" },
      create: { id: "test-cat-expense-block", name: "Тест оплата", type: "expense", isActive: true },
      update: {},
    });

    await db.paymentCounter.upsert({
      where: { prefix: "PAY" },
      create: { prefix: "PAY", lastNumber: 100 },
      update: {},
    });

    const counter = await db.paymentCounter.update({
      where: { prefix: "PAY" },
      data: { lastNumber: { increment: 1 } },
    });

    await db.payment.create({
      data: {
        number: `PAY-${String(counter.lastNumber).padStart(6, "0")}`,
        type: "expense",
        categoryId: cat.id,
        counterpartyId: supplier.id,
        documentId: doc.id, // linked!
        amount: 50000,
        paymentMethod: "bank_transfer",
        tenantId: TENANT_ID,
      },
    });

    // Cancellation must be blocked
    await expect(
      cancelDocumentTransactional(doc.id, "test-actor")
    ).rejects.toThrow(DocumentCancelError);

    try {
      await cancelDocumentTransactional(doc.id, "test-actor");
    } catch (e) {
      if (e instanceof DocumentCancelError) {
        expect(e.statusCode).toBe(409);
        expect(e.message).toMatch(/платёж/i);
      }
    }
  });

  it("cancellation succeeds when no Payment is linked", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 12000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 12, price: 1000 });

    // No Payment linked — should cancel successfully
    const result = await cancelDocumentTransactional(doc.id, "test-actor");
    expect(result.status).toBe("cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Financial invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial — Invariants: double-entry always balanced", () => {
  it("all LedgerLine rows: SUM(debit) == SUM(credit) after journal posting", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 9000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 9, price: 1000 });

    await postJournalForDocument({ ...doc, totalAmount: 9000 });

    const agg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
    });

    const diff = Math.abs(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
    expect(diff).toBeLessThan(0.01);
  });

  it("cancelled document has zero net journal impact (debit = credit across all entries)", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 7000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 7, price: 1000 });

    await postJournalForDocument({ ...doc, totalAmount: 7000 });
    await cancelDocumentTransactional(doc.id, "test-actor");

    const entries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      select: { id: true },
    });
    const entryIds = entries.map((e) => e.id);

    const agg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: { entryId: { in: entryIds } },
    });

    const totalDebit = Number(agg._sum.debit ?? 0);
    const totalCredit = Number(agg._sum.credit ?? 0);

    // Net impact of original + reversal = zero
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Balance equation and outgoing_shipment journal accounts
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial — Suite 5: Balance equation and outgoing_shipment journal", () => {
  /**
   * verifyBalanceEquation: checks SUM(debit) == SUM(credit) across all LedgerLines
   * for a given tenant's documents. A balanced system means Assets = Liabilities + Equity.
   */
  async function verifyBalanceEquation(tenantId: string): Promise<boolean> {
    // Find all JournalEntries whose sourceId matches documents of this tenant
    const tenantDocs = await db.document.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const docIds = tenantDocs.map((d) => d.id);
    if (docIds.length === 0) return true;

    const entries = await db.journalEntry.findMany({
      where: { sourceId: { in: docIds } },
      select: { id: true },
    });
    if (entries.length === 0) return true;

    const entryIds = entries.map((e) => e.id);
    const agg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: { entryId: { in: entryIds } },
    });

    const totalDebit = Number(agg._sum.debit ?? 0);
    const totalCredit = Number(agg._sum.credit ?? 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }

  it("Assets always equal Liabilities + Equity (balance equation holds after posting)", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 6000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 6, price: 1000 });
    await postJournalForDocument({ ...doc, totalAmount: 6000 });

    const balanced = await verifyBalanceEquation(TENANT_ID);
    expect(balanced).toBe(true);
  });

  it("outgoing_shipment creates both revenue and COGS entries", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const customer = await createCounterparty({ type: "customer", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    // First: receive stock so COGS can be calculated
    const purchase = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: await createCounterparty({ type: "supplier", tenantId: TENANT_ID }).then((c) => c.id),
      totalAmount: 5000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(purchase.id, product.id, { quantity: 10, price: 500 });
    await postJournalForDocument({ ...purchase, totalAmount: 5000 });

    // Seed StockRecord so COGS calculation has averageCost to work with
    await db.stockRecord.upsert({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      create: { warehouseId: warehouse.id, productId: product.id, quantity: 10, averageCost: 500 },
      update: { quantity: 10, averageCost: 500 },
    });

    // Then: ship product to customer
    const shipment = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: customer.id,
      totalAmount: 4000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(shipment.id, product.id, { quantity: 4, price: 1000 });
    await postJournalForDocument({ ...shipment, totalAmount: 4000 });

    const entries = await db.journalEntry.findMany({
      where: { sourceId: shipment.id },
      include: { lines: { include: { account: true } } },
    });

    expect(entries.length).toBeGreaterThanOrEqual(1);

    const accountCodes = entries
      .flatMap((e) => e.lines)
      .map((l) => l.account.code);

    // Revenue: Дт 62 / Кт 90.1
    expect(accountCodes).toContain("62");
    expect(accountCodes).toContain("90.1");

    // COGS: Дт 90.2 / Кт 41.1
    expect(accountCodes).toContain("90.2");
    expect(accountCodes).toContain("41.1");

    // Double-entry must hold for shipment
    const shipmentEntryIds = entries.map((e) => e.id);
    const agg = await db.ledgerLine.aggregate({
      _sum: { debit: true, credit: true },
      where: { entryId: { in: shipmentEntryIds } },
    });
    expect(Math.abs(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0))).toBeLessThan(0.01);
  });
});

describe("Financial — Invariants: stock reversals", () => {
  it("stock movements are reversed on cancellation", async () => {
    const warehouse = await createWarehouse({ tenantId: TENANT_ID });
    const supplier = await createCounterparty({ type: "supplier", tenantId: TENANT_ID });
    const product = await createProduct({ tenantId: TENANT_ID });

    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: supplier.id,
      totalAmount: 5000,
      confirmedAt: new Date(),
      tenantId: TENANT_ID,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 5, price: 1000 });

    // Seed stock movement for the document (normally created by confirmDocumentTransactional)
    // MovementType enum: receipt | write_off | shipment | return | transfer_out | transfer_in | adjustment
    await db.stockMovement.create({
      data: {
        documentId: doc.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: 5,
        cost: 1000,
        totalCost: 5000,
        type: "receipt",
        isReversing: false,
      },
    });

    await cancelDocumentTransactional(doc.id, "test-actor");

    const reversingMovements = await db.stockMovement.findMany({
      where: { documentId: doc.id, isReversing: true },
    });

    expect(reversingMovements.length).toBeGreaterThanOrEqual(1);
    const netQty = reversingMovements.reduce((s, m) => s + Number(m.quantity), 0);
    expect(netQty).toBeLessThan(0); // Reversing = negative quantity
  });
});

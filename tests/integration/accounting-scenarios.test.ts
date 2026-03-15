/**
 * Cross-domain accounting scenario tests.
 *
 * These tests verify ECONOMIC CORRECTNESS — not individual module correctness.
 * Each scenario represents a complete business event and asserts that all affected
 * domains (stock, journal, balances) remain mutually consistent.
 *
 * Module-level tests live in their respective files. This file tests
 * cross-domain invariants that no single module test can catch:
 *   — double-entry always holds (∑debit = ∑credit) across the full confirm chain
 *   — stock and ledger move together
 *   — adjustment document type matches delta direction (shortage → write_off, surplus → stock_receipt)
 *   — payables/receivables accounts reflect actual obligations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDatabase, getTestDb } from "../helpers/test-db";
import {
  createUser,
  createWarehouse,
  createProduct,
  createDocument,
  createDocumentItem,
  seedReportAccounts,
  seedTenantSettings,
} from "../helpers/factories";
import {
  createTestRequest,
  mockAuthUser,
  mockAuthNone,
} from "../helpers/api-client";
import { autoPostDocument } from "@/lib/modules/accounting/finance/journal";
import { getAccountBalance } from "@/lib/modules/accounting/balances";

// Auth mock must be before route imports
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return { ...actual, getAuthSession: vi.fn() };
});

import { POST as CONFIRM } from "@/app/api/accounting/documents/[id]/confirm/route";

// ─── shared setup ─────────────────────────────────────────────────────────────

let adminUser: Awaited<ReturnType<typeof createUser>>;
let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
let product: Awaited<ReturnType<typeof createProduct>>;

beforeEach(async () => {
  await cleanDatabase();
  const accountIds = await seedReportAccounts();
  adminUser = await createUser({ role: "admin" });
  // tenantId matches the tenant created by createUser factory: "tenant-<userId>"
  const tenantId = `tenant-${adminUser.id}`;
  await seedTenantSettings(tenantId, accountIds);
  warehouse = await createWarehouse({ tenantId });
  product = await createProduct({ name: "Test Product", tenantId });
  mockAuthNone();
});

// ─── shared helpers ───────────────────────────────────────────────────────────

/** Confirm a document via route + flush fire-and-forget effects */
async function confirmDoc(docId: string) {
  mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
  const req = createTestRequest(
    `/api/accounting/documents/${docId}/confirm`,
    { method: "POST" }
  );
  const res = await CONFIRM(req, { params: Promise.resolve({ id: docId }) });
  expect(res.status).toBe(200);
  // Explicit flush: autoPostDocument reads doc.totalAmount from DB.
  // The CONFIRM route does not recalculate totalAmount from items, so we
  // compute it from items here and update the document before posting.
  const db = getTestDb();
  const items = await db.documentItem.findMany({ where: { documentId: docId } });
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const doc = await db.document.update({
    where: { id: docId },
    data: { totalAmount },
  });
  await autoPostDocument(docId, doc.number, doc.date);
}

/**
 * Assert double-entry invariant: for every JournalEntry produced by a document,
 * sum(debit lines) must equal sum(credit lines).
 * This is the most fundamental accounting invariant — catches swapped sides,
 * dropped lines, or rounding applied to only one side.
 */
async function assertDoubleEntry(docId: string) {
  const db = getTestDb();
  const entries = await db.journalEntry.findMany({
    where: { sourceId: docId },
    include: { lines: true },
  });
  // At least one entry must have been created
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    const totalDebit  = entry.lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2); // must balance to the cent
  }
}

// ─── Scenario 1: Purchase (incoming_shipment) ─────────────────────────────────

describe("Accounting Scenario 1 — incoming_shipment: purchase increases inventory", () => {
  it("stock increases, journal is balanced, payables (Cr 60) reflect the obligation", async () => {
    const doc = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 1000 });

    await confirmDoc(doc.id);

    const db = getTestDb();

    // Stock domain: inventory increased
    const stock = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    expect(stock?.quantity).toBe(10);

    // Journal domain: double-entry invariant holds
    await assertDoubleEntry(doc.id);

    // Ledger domain: payables account (60) has a credit balance — we owe the supplier
    const payables = await getAccountBalance("60", new Date());
    expect(payables.credit).toBeGreaterThan(0);
  });

  it("inventory account (41.1) debit equals purchase total — catches swapped Dr/Cr sides", async () => {
    const doc = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(doc.id, product.id, { quantity: 5, price: 2000 });

    await confirmDoc(doc.id);

    const inventory = await getAccountBalance("41.1", new Date());
    // If posting rules swap Dr/Cr, debit would be 0 — this assertion would catch it
    expect(inventory.debit).toBe(10000); // 5 × 2000
  });
});

// ─── Scenario 2: Outgoing shipment (Sale) ───────────────────────────────────

describe("Accounting Scenario 2 — outgoing_shipment: sale reduces inventory", () => {
  beforeEach(async () => {
    // Seed inventory via a confirmed purchase so the shipment has stock to draw from
    const purchase = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(purchase.id, product.id, { quantity: 20, price: 500 });
    await confirmDoc(purchase.id);
  });

  it("stock decreases and journal is balanced — catches shipment that skips stock movement", async () => {
    const db = getTestDb();
    const before = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });

    const shipment = await createDocument({ type: "outgoing_shipment", warehouseId: warehouse.id });
    await createDocumentItem(shipment.id, product.id, { quantity: 5, price: 800 });
    await confirmDoc(shipment.id);

    const after = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });

    // Stock domain: inventory decreased
    expect(after!.quantity).toBe(before!.quantity - 5);

    // Journal domain: double-entry invariant holds
    await assertDoubleEntry(shipment.id);
  });

  it("receivables (Dr 62) reflect customer obligation after outgoing shipment", async () => {
    const shipment = await createDocument({ type: "outgoing_shipment", warehouseId: warehouse.id });
    await createDocumentItem(shipment.id, product.id, { quantity: 3, price: 900 });
    await confirmDoc(shipment.id);

    // outgoing_shipment posts Dr 62 / Cr 90.1 — if mapping is wrong, this catches it
    const receivables = await getAccountBalance("62", new Date());
    expect(receivables.debit).toBeGreaterThan(0);
  });
});

// ─── Scenario 3: Inventory shortage ──────────────────────────────────────────

describe("Accounting Scenario 3 — inventory_count shortage: write_off created, stock reduced", () => {
  beforeEach(async () => {
    const purchase = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(purchase.id, product.id, { quantity: 10, price: 1000 });
    await confirmDoc(purchase.id);
  });

  it("negative delta → write_off linked doc (NOT stock_receipt) — catches sign flip bug", async () => {
    const db = getTestDb();
    const countDoc = await createDocument({ type: "inventory_count", warehouseId: warehouse.id });
    await createDocumentItem(countDoc.id, product.id, {
      quantity: 0, price: 0, expectedQty: 10, actualQty: 8, // shortage: -2
    });
    await confirmDoc(countDoc.id);

    const updated = await db.document.findUnique({ where: { id: countDoc.id } });
    expect(updated?.adjustmentsCreated).toBe(true);

    // Critical: shortage must create write_off, never stock_receipt
    const writeOffs = await db.document.findMany({
      where: { linkedDocumentId: countDoc.id, type: "write_off" },
    });
    expect(writeOffs).toHaveLength(1);

    const stockReceipts = await db.document.findMany({
      where: { linkedDocumentId: countDoc.id, type: "stock_receipt" },
    });
    expect(stockReceipts).toHaveLength(0); // must NOT create stock_receipt for shortage

    // Stock domain: quantity reduced to actualQty
    const stock = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    expect(stock?.quantity).toBe(8);
  });
});

// ─── Scenario 4: Inventory surplus ───────────────────────────────────────────

describe("Accounting Scenario 4 — inventory_count surplus: stock_receipt created, stock increased", () => {
  beforeEach(async () => {
    const purchase = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(purchase.id, product.id, { quantity: 5, price: 1000 });
    await confirmDoc(purchase.id);
  });

  it("positive delta → stock_receipt linked doc (NOT write_off) — catches sign flip bug", async () => {
    const db = getTestDb();
    const countDoc = await createDocument({ type: "inventory_count", warehouseId: warehouse.id });
    await createDocumentItem(countDoc.id, product.id, {
      quantity: 0, price: 0, expectedQty: 5, actualQty: 8, // surplus: +3
    });
    await confirmDoc(countDoc.id);

    const updated = await db.document.findUnique({ where: { id: countDoc.id } });
    expect(updated?.adjustmentsCreated).toBe(true);

    // Critical: surplus must create stock_receipt, never write_off
    const stockReceipts = await db.document.findMany({
      where: { linkedDocumentId: countDoc.id, type: "stock_receipt" },
    });
    expect(stockReceipts).toHaveLength(1);

    const writeOffs = await db.document.findMany({
      where: { linkedDocumentId: countDoc.id, type: "write_off" },
    });
    expect(writeOffs).toHaveLength(0); // must NOT create write_off for surplus

    // Stock domain: quantity increased to actualQty
    const stock = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    expect(stock?.quantity).toBe(8);
  });
});

// ─── Scenario 5: Purchase → Sale full cycle ───────────────────────────────────

describe("Accounting Scenario 5 — full cycle: purchase then sale", () => {
  it("after purchase + sale, double-entry holds for both documents independently", async () => {
    // Purchase
    const purchase = await createDocument({ type: "incoming_shipment", warehouseId: warehouse.id });
    await createDocumentItem(purchase.id, product.id, { quantity: 10, price: 1000 });
    await confirmDoc(purchase.id);

    // Outgoing shipment (reduces stock, posts Dr62/Cr90.1)
    const shipment = await createDocument({ type: "outgoing_shipment", warehouseId: warehouse.id });
    await createDocumentItem(shipment.id, product.id, { quantity: 4, price: 1500 });
    await confirmDoc(shipment.id);

    // Both events must independently satisfy double-entry
    await assertDoubleEntry(purchase.id);
    await assertDoubleEntry(shipment.id);

    // Net stock: 10 purchased - 4 shipped = 6
    const db = getTestDb();
    const stock = await db.stockRecord.findFirst({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    expect(stock?.quantity).toBe(6);

    // Payables (Cr 60) reflect purchase obligation
    const payables = await getAccountBalance("60", new Date());
    expect(payables.credit).toBeGreaterThan(0);

    // Receivables (Dr 62) reflect shipment obligation
    const receivables = await getAccountBalance("62", new Date());
    expect(receivables.debit).toBeGreaterThan(0);
  });
});

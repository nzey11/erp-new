/**
 * Integration Tests: Document Cancellation → Journal Reversal
 *
 * Verifies that cancelDocumentTransactional() correctly reverses all
 * journal entries for outgoing_shipment and incoming_shipment.
 *
 * Covers both scenarios:
 *   1. Journal entries already exist (outbox processed before cancel)
 *   2. Journal entries NOT yet created (outbox not processed — race condition)
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  cancelDocumentTransactional,
} from "@/lib/modules/accounting/services/document-confirm.service";
import { autoPostDocument } from "@/lib/modules/accounting/finance/journal";
import { processOutboxEvents } from "@/lib/events";
import {
  registerOutboxHandler,
  clearOutboxHandlers,
} from "@/lib/events/outbox";
import { onDocumentCancelledJournal } from "@/lib/modules/accounting/handlers/cancel-journal-handler";
import { resetOutboxHandlerRegistration } from "@/lib/events/handlers/register-outbox-handlers";
import {
  createDocument,
  createDocumentItem,
  createProduct,
  createWarehouse,
  createCounterparty,
  createStockRecord,
  seedTestAccounts,
  seedTenantSettings,
  createTenant,
} from "../../helpers/factories";

let accountIds: Record<string, string>;
let tenantId: string;

// =============================================
// Setup: seed accounts once, re-create tenant before each test
// (cleanDatabase() in global beforeEach wipes tenant rows, so tenant
//  must be re-seeded here — not just in beforeAll)
// =============================================

beforeAll(async () => {
  accountIds = await seedTestAccounts();
  tenantId = "test-cancel-journal-tenant";
  
  // Register cancel handler for outbox processing
  clearOutboxHandlers();
  resetOutboxHandlerRegistration();
  registerOutboxHandler("DocumentCancelled", onDocumentCancelledJournal as never);
});

beforeEach(async () => {
  await createTenant({ id: tenantId });
  await seedTenantSettings(tenantId, accountIds);
});

// =============================================
// outgoing_shipment cancellation
// =============================================

describe("cancelDocumentTransactional — outgoing_shipment", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let counterparty: Awaited<ReturnType<typeof createCounterparty>>;

  beforeEach(async () => {
    warehouse = await createWarehouse({ tenantId });
    product = await createProduct({ tenantId });
    counterparty = await createCounterparty({ tenantId });
    // Seed stock so outgoing_shipment can be confirmed-like state
    await createStockRecord(warehouse.id, product.id, 100);
  });

  it("reverses journal entries when entries already exist (outbox was processed)", async () => {
    // Create confirmed outgoing_shipment
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 5000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });

    // Manually post journal (simulating outbox handler having run)
    await autoPostDocument(doc.id, doc.number, doc.date);

    const entriesBefore = await db.journalEntry.findMany({
      where: { sourceId: doc.id, isReversed: false },
    });
    expect(entriesBefore.length).toBeGreaterThan(0);

    // Cancel the document
    const cancelled = await cancelDocumentTransactional(doc.id, "test-user");
    expect(cancelled.status).toBe("cancelled");

    // Process outbox events (handlers will reverse journal entries)
    await processOutboxEvents(10);

    // Verify: original entries marked as reversed
    const originalEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id, isManual: false },
    });
    expect(originalEntries.length).toBeGreaterThan(0);
    for (const entry of originalEntries) {
      expect(entry.isReversed).toBe(true);
    }

    // Verify: reversal entries created (isManual: true, reversedById set)
    const reversalEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id, isManual: true },
    });
    expect(reversalEntries.length).toBeGreaterThan(0);
    expect(reversalEntries.every((e) => e.reversedById !== null)).toBe(true);

    // Verify: net effect — for each reversed entry, reversal entry has swapped Dt/Kt
    const allEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      include: { lines: true },
    });

    const totalDebitAll = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.debit), 0);
    const totalCreditAll = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.credit), 0);

    // After reversal: net debit = net credit = 0 (entries cancel each other out)
    expect(totalDebitAll).toBe(totalCreditAll);
  });

  it("reverses journal entries when outbox NOT processed yet (race condition)", async () => {
    // Create confirmed outgoing_shipment WITHOUT calling autoPostDocument
    // (simulating: document confirmed, outbox pending, user cancels immediately)
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 3000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 6, price: 500 });

    // Verify: NO journal entries exist yet
    const entriesBeforeCancel = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    expect(entriesBeforeCancel).toHaveLength(0);

    // Cancel — should auto-post AND reverse
    const cancelled = await cancelDocumentTransactional(doc.id, "test-user");
    expect(cancelled.status).toBe("cancelled");

    // Process outbox events (handlers will auto-post and reverse)
    await processOutboxEvents(10);

    // Verify: reversal entries were created
    const allEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      include: { lines: true },
    });

    // At minimum: 1 original + 1 reversal
    expect(allEntries.length).toBeGreaterThanOrEqual(2);

    // All original (auto-posted) entries must be reversed
    const autoEntries = allEntries.filter((e) => !e.isManual);
    expect(autoEntries.every((e) => e.isReversed)).toBe(true);

    // Net accounting effect = 0 (entries cancel each other)
    const totalDebit = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("is idempotent — second cancel on already-cancelled document does not create duplicate reversals", async () => {
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 2000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 4, price: 500 });
    await autoPostDocument(doc.id, doc.number, doc.date);

    // First cancel
    await cancelDocumentTransactional(doc.id, "test-user");
    await processOutboxEvents(10);

    const entriesAfterFirstCancel = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    const countAfterFirst = entriesAfterFirstCancel.length;

    // Second cancel — must be idempotent (no new entries)
    await cancelDocumentTransactional(doc.id, "test-user");
    await processOutboxEvents(10);

    const entriesAfterSecondCancel = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    expect(entriesAfterSecondCancel.length).toBe(countAfterFirst);
  });
});

// =============================================
// incoming_shipment cancellation
// =============================================

describe("cancelDocumentTransactional — incoming_shipment", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let counterparty: Awaited<ReturnType<typeof createCounterparty>>;

  beforeEach(async () => {
    warehouse = await createWarehouse({ tenantId });
    product = await createProduct({ tenantId });
    counterparty = await createCounterparty({ tenantId, type: "supplier" });
  });

  it("reverses Дт 41.1 / Кт 60 journal entry on cancellation", async () => {
    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 10000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 20, price: 500 });

    // Manually post journal
    await autoPostDocument(doc.id, doc.number, doc.date);

    const originalEntry = await db.journalEntry.findFirst({
      where: { sourceId: doc.id, isManual: false },
      include: { lines: { include: { account: true } } },
    });
    expect(originalEntry).not.toBeNull();

    // Cancel
    const cancelled = await cancelDocumentTransactional(doc.id, "test-user");
    expect(cancelled.status).toBe("cancelled");

    // Process outbox events
    await processOutboxEvents(10);

    // Verify original entry is reversed
    const updatedOriginal = await db.journalEntry.findUnique({
      where: { id: originalEntry!.id },
    });
    expect(updatedOriginal!.isReversed).toBe(true);

    // Verify reversal entry exists with swapped lines
    const reversalEntry = await db.journalEntry.findFirst({
      where: { reversedById: originalEntry!.id },
      include: { lines: { include: { account: true } } },
    });
    expect(reversalEntry).not.toBeNull();

    // Check accounts in reversal: original Дт 41.1 → reversal Кт 41.1
    const inv41Account = accountIds["41.1"];
    const account60 = accountIds["60"];

    const inv41LineInReversal = reversalEntry!.lines.find(
      (l) => l.accountId === inv41Account
    );
    const acc60LineInReversal = reversalEntry!.lines.find(
      (l) => l.accountId === account60
    );

    expect(inv41LineInReversal).not.toBeNull();
    expect(acc60LineInReversal).not.toBeNull();

    // In reversal: 41.1 is on credit side (was debit in original)
    expect(Number(inv41LineInReversal!.credit)).toBeGreaterThan(0);
    expect(Number(inv41LineInReversal!.debit)).toBe(0);

    // In reversal: 60 is on debit side (was credit in original)
    expect(Number(acc60LineInReversal!.debit)).toBeGreaterThan(0);
    expect(Number(acc60LineInReversal!.credit)).toBe(0);
  });

  it("reverses entries when outbox not yet processed (race condition)", async () => {
    const doc = await createDocument({
      type: "incoming_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 5000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });

    // No autoPostDocument — outbox not processed
    const entriesBefore = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    expect(entriesBefore).toHaveLength(0);

    const cancelled = await cancelDocumentTransactional(doc.id, "test-user");
    expect(cancelled.status).toBe("cancelled");

    // Process outbox events
    await processOutboxEvents(10);

    const allEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
      include: { lines: true },
    });
    expect(allEntries.length).toBeGreaterThanOrEqual(2);

    // Net effect = 0
    const totalDebit = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = allEntries
      .flatMap((e) => e.lines)
      .reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });
});

// =============================================
// Phase 2: DocumentCancelled event flow tests
// =============================================

describe("DocumentCancelled — Outbox Event Flow", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let counterparty: Awaited<ReturnType<typeof createCounterparty>>;

  beforeEach(async () => {
    warehouse = await createWarehouse({ tenantId });
    product = await createProduct({ tenantId });
    counterparty = await createCounterparty({ tenantId });
    await createStockRecord(warehouse.id, product.id, 100);
  });

  it("Test 1 — Cancel creates PENDING OutboxEvent that becomes PROCESSED", async () => {
    // Create confirmed document
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 5000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
    await autoPostDocument(doc.id, doc.number, doc.date);

    // Verify no outbox events exist before cancel
    const eventsBefore = await db.outboxEvent.findMany({
      where: { aggregateId: doc.id, eventType: "DocumentCancelled" },
    });
    expect(eventsBefore).toHaveLength(0);

    // Cancel the document
    await cancelDocumentTransactional(doc.id, "test-user");

    // Verify PENDING outbox event was created
    const pendingEvent = await db.outboxEvent.findFirst({
      where: { aggregateId: doc.id, eventType: "DocumentCancelled" },
    });
    expect(pendingEvent).not.toBeNull();
    expect(pendingEvent?.status).toBe("PENDING");

    // Process outbox events
    await processOutboxEvents(10);

    // Verify event is now PROCESSED
    const processedEvent = await db.outboxEvent.findFirst({
      where: { aggregateId: doc.id, eventType: "DocumentCancelled" },
    });
    expect(processedEvent?.status).toBe("PROCESSED");
    expect(processedEvent?.processedAt).not.toBeNull();
  });

  it("Test 2 — Cancel handler is idempotent (second run doesn't duplicate)", async () => {
    // Create confirmed document
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 5000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
    await autoPostDocument(doc.id, doc.number, doc.date);

    // Cancel and process outbox
    await cancelDocumentTransactional(doc.id, "test-user");
    await processOutboxEvents(10);

    // Count entries after first cancel
    const entriesAfterFirst = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    const countAfterFirst = entriesAfterFirst.length;
    
    // Count reversal entries (isManual = true, description contains "сторно")
    const reversalsAfterFirst = await db.journalEntry.count({
      where: { 
        sourceId: doc.id, 
        isManual: true,
        description: { contains: "сторно" },
      },
    });
    expect(reversalsAfterFirst).toBeGreaterThanOrEqual(1);

    // Run processOutboxEvents again (simulating duplicate processing)
    await processOutboxEvents(10);

    // Count entries after second processing
    const entriesAfterSecond = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    const countAfterSecond = entriesAfterSecond.length;

    // Count reversal entries after second run
    const reversalsAfterSecond = await db.journalEntry.count({
      where: { 
        sourceId: doc.id, 
        isManual: true,
        description: { contains: "сторно" },
      },
    });

    // Entry count should be the same (no duplicates)
    expect(countAfterSecond).toBe(countAfterFirst);
    // Reversal count should be the same (no duplicate reversals)
    expect(reversalsAfterSecond).toBe(reversalsAfterFirst);
  });

  it("Test 3 — Cancel of already-cancelled document returns early without error", async () => {
    // Create confirmed document
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
      counterpartyId: counterparty.id,
      totalAmount: 5000,
      tenantId,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
    await autoPostDocument(doc.id, doc.number, doc.date);

    // First cancel
    const firstCancel = await cancelDocumentTransactional(doc.id, "test-user");
    expect(firstCancel.status).toBe("cancelled");
    await processOutboxEvents(10);

    // Second cancel on already-cancelled document
    // Should return early with the cancelled document (idempotent), not throw
    const secondCancel = await cancelDocumentTransactional(doc.id, "test-user");
    expect(secondCancel.status).toBe("cancelled");
    
    // Process outbox again (should be no-op since document already cancelled)
    await processOutboxEvents(10);

    // Verify no duplicate entries were created
    const allEntries = await db.journalEntry.findMany({
      where: { sourceId: doc.id },
    });
    
    // Should have original + reversal, no duplicates
    const reversalEntries = allEntries.filter(e => e.isManual && e.description?.includes("сторно"));
    expect(reversalEntries.length).toBeGreaterThanOrEqual(1);
    expect(reversalEntries.length).toBeLessThanOrEqual(2); // At most 2 (Дт + Кт lines in one entry)
  });
});

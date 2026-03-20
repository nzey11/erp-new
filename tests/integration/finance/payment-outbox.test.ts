/**
 * Integration Tests: Payment Outbox Event Flow
 *
 * Verifies that PaymentService.createPayment and deletePayment emit
 * outbox events that are processed by accounting handlers.
 *
 * Phase 3: Finance module decoupling from Accounting.
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import { PaymentService } from "@/lib/modules/finance/services/payment.service";
import { processOutboxEvents } from "@/lib/events";
import {
  registerOutboxHandler,
  clearOutboxHandlers,
} from "@/lib/events/outbox";
import { onPaymentCreated } from "@/lib/modules/accounting/handlers/payment-created-handler";
import { onPaymentDeleted } from "@/lib/modules/accounting/handlers/payment-deleted-handler";
import { resetOutboxHandlerRegistration } from "@/lib/events/handlers/register-outbox-handlers";
import {
  createTenant,
  createCounterparty,
  seedTestAccounts,
  seedTenantSettings,
} from "../../helpers/factories";

let tenantId: string;
let counterpartyId: string;
let categoryId: string;

// =============================================
// Setup
// =============================================

beforeAll(async () => {
  await seedTestAccounts();
  tenantId = "test-payment-outbox-tenant";

  // Register payment handlers
  clearOutboxHandlers();
  resetOutboxHandlerRegistration();
  registerOutboxHandler("PaymentCreated", onPaymentCreated as never);
  registerOutboxHandler("PaymentDeleted", onPaymentDeleted as never);

  // Ensure PaymentCounter exists
  await db.paymentCounter.upsert({
    where: { prefix: "PAY" },
    create: { prefix: "PAY", lastNumber: 0 },
    update: {},
  });
});

beforeEach(async () => {
  await createTenant({ id: tenantId });
  await seedTenantSettings(tenantId, {});

  // Create a counterparty
  const counterparty = await createCounterparty({ tenantId });
  counterpartyId = counterparty.id;

  // Create a finance category with unique name per test
  const timestamp = Date.now();
  const category = await db.financeCategory.create({
    data: {
      name: `Test Category ${timestamp}`,
      type: "income",
      defaultAccountCode: "91.1",
      isActive: true,
      order: 1,
    },
  });
  categoryId = category.id;
});

// =============================================
// Phase 3 Tests
// =============================================

describe("Payment Outbox Event Flow", () => {
  it("Test 1 — PaymentCreated emits OutboxEvent that becomes PROCESSED", async () => {
    // Create payment
    const payment = await PaymentService.createPayment(
      {
        type: "income",
        categoryId,
        counterpartyId,
        amount: 5000,
        paymentMethod: "cash",
        description: "Test payment",
      },
      tenantId,
      "test-user"
    );

    // Verify payment was created
    expect(payment).not.toBeNull();
    expect(payment.id).toBeDefined();

    // Verify PENDING outbox event was created
    const pendingEvent = await db.outboxEvent.findFirst({
      where: {
        aggregateId: payment.id,
        eventType: "PaymentCreated",
      },
    });
    expect(pendingEvent).not.toBeNull();
    expect(pendingEvent?.status).toBe("PENDING");

    // Process outbox events
    await processOutboxEvents(10);

    // Verify event is now PROCESSED
    const processedEvent = await db.outboxEvent.findFirst({
      where: {
        aggregateId: payment.id,
        eventType: "PaymentCreated",
      },
    });
    expect(processedEvent?.status).toBe("PROCESSED");
    expect(processedEvent?.processedAt).not.toBeNull();

    // Verify journal entry was created
    const journalEntry = await db.journalEntry.findFirst({
      where: {
        sourceId: payment.id,
        sourceType: "finance_payment",
      },
    });
    expect(journalEntry).not.toBeNull();
  });

  it("Test 2 — PaymentDeleted handler is idempotent (second run doesn't duplicate)", async () => {
    // Create payment
    const payment = await PaymentService.createPayment(
      {
        type: "expense",
        categoryId,
        counterpartyId,
        amount: 3000,
        paymentMethod: "bank_transfer",
      },
      tenantId
    );

    // Process PaymentCreated event
    await processOutboxEvents(10);

    // Verify journal entry exists
    const entriesBefore = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
    });
    expect(entriesBefore.length).toBe(1);

    // Delete payment
    await PaymentService.deletePayment(payment.id, tenantId);

    // Process PaymentDeleted event
    await processOutboxEvents(10);

    // Count entries after first delete processing
    const entriesAfterFirst = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
    });
    const countAfterFirst = entriesAfterFirst.length;

    // Should have original + reversal
    expect(countAfterFirst).toBe(2);

    // Verify original is marked reversed
    const originalEntry = entriesAfterFirst.find((e) => !e.reversedById);
    expect(originalEntry?.isReversed).toBe(true);

    // Run processOutboxEvents again (simulating duplicate processing)
    await processOutboxEvents(10);

    // Count entries after second processing
    const entriesAfterSecond = await db.journalEntry.findMany({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
    });

    // Entry count should be the same (no duplicates)
    expect(entriesAfterSecond.length).toBe(countAfterFirst);

    // Only one reversal should exist
    const reversalEntries = entriesAfterSecond.filter(
      (e) => e.reversedById !== null
    );
    expect(reversalEntries.length).toBe(1);
  });

  it("Test 3 — PaymentCreated and PaymentDeleted flow end-to-end", async () => {
    // Create payment
    const payment = await PaymentService.createPayment(
      {
        type: "income",
        categoryId,
        counterpartyId,
        amount: 10000,
        paymentMethod: "card",
        description: "End-to-end test payment",
      },
      tenantId,
      "e2e-test-user"
    );

    // Process creation
    await processOutboxEvents(10);

    // Verify journal entry lines
    const journalEntry = await db.journalEntry.findFirst({
      where: { sourceId: payment.id, sourceType: "finance_payment" },
      include: { lines: true },
    });
    expect(journalEntry).not.toBeNull();
    expect(journalEntry?.lines.length).toBe(2);

    // For income: Дт 50 (cash) Кт 91.1 (income)
    const debitLine = journalEntry?.lines.find((l) => Number(l.debit) > 0);
    const creditLine = journalEntry?.lines.find((l) => Number(l.credit) > 0);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();
    expect(Number(debitLine?.debit)).toBe(10000);
    expect(Number(creditLine?.credit)).toBe(10000);

    // Delete payment
    await PaymentService.deletePayment(payment.id, tenantId);

    // Process deletion
    await processOutboxEvents(10);

    // Verify reversal entry
    const reversalEntry = await db.journalEntry.findFirst({
      where: {
        sourceId: payment.id,
        sourceType: "finance_payment",
        reversedById: { not: null },
      },
      include: { lines: true },
    });
    expect(reversalEntry).not.toBeNull();
    expect(reversalEntry?.lines.length).toBe(2);

    // Verify reversal has swapped debit/credit
    const reversalDebitLine = reversalEntry?.lines.find((l) => Number(l.debit) > 0);
    const reversalCreditLine = reversalEntry?.lines.find((l) => Number(l.credit) > 0);
    expect(reversalDebitLine).toBeDefined();
    expect(reversalCreditLine).toBeDefined();

    // Original: Дт 50 Кт 91.1
    // Reversal: Дт 91.1 Кт 50 (swapped)
    expect(Number(reversalDebitLine?.debit)).toBe(10000);
    expect(Number(reversalCreditLine?.credit)).toBe(10000);

    // Verify original is marked reversed
    const updatedOriginal = await db.journalEntry.findUnique({
      where: { id: journalEntry!.id },
    });
    expect(updatedOriginal?.isReversed).toBe(true);
  });
});

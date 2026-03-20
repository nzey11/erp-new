/**
 * Phase 4 Ecommerce Decoupling Integration Tests
 *
 * Verifies that ecommerce module is decoupled from accounting module:
 *   1. OrderPaymentConfirmed event flows through Outbox → document confirmed
 *   2. CustomerCreated handler is idempotent (only one Counterparty created)
 *   3. Customer deletion sets Counterparty.counterpartyId to null (SetNull)
 *
 * Infrastructure:
 *   - tests/setup.ts calls cleanDatabase() before every test automatically.
 *   - Handlers are registered via registerOutboxHandlers() in beforeAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  clearOutboxHandlers,
  markOutboxProcessed,
  type EventHandler,
} from "@/lib/events/outbox";
import {
  registerOutboxHandlers,
  resetOutboxHandlerRegistration,
} from "@/lib/events/handlers/register-outbox-handlers";
import type { DomainEvent } from "@/lib/events/types";
import type { Prisma } from "@/lib/generated/prisma/client";
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

// ── Stable tenant IDs ───────────────────────────────────────────────────────────

const TENANT_ID = "test-p4-ecommerce-tenant";

// Account IDs seeded once
let accountIds: Record<string, string>;

// ── Global setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  accountIds = await seedTestAccounts();
  clearOutboxHandlers();
  resetOutboxHandlerRegistration();
  registerOutboxHandlers();
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

// ── Local event-claiming helper ───────────────────────────────────────────────

const localRegistry = new Map<string, EventHandler[]>();

/**
 * Drive pending outbox events through locally-registered handlers.
 * Uses PostgreSQL NOW() for availableAt comparison to avoid clock skew.
 */
async function driveHandlers(limit = 10): Promise<{
  claimed: number;
  processed: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
}> {
  // Get PostgreSQL NOW() to avoid clock skew between JS and DB
  const [{ now }] = await db.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;

  const pendingRows = await db.outboxEvent.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (pendingRows.length === 0) {
    return { claimed: 0, processed: 0, failed: 0, errors: [] };
  }

  await db.outboxEvent.updateMany({
    where: { id: { in: pendingRows.map((r) => r.id) } },
    data: { status: "PROCESSING" },
  });

  let processed = 0;
  let failed = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  for (const row of pendingRows) {
    try {
      const domainEvent = row.payload as unknown as DomainEvent;
      const handlers = localRegistry.get(domainEvent.type) ?? [];
      if (handlers.length === 0) {
        console.warn(`[test-driveHandlers] No handlers for ${domainEvent.type}`);
      } else {
        for (const handler of handlers) {
          await handler(domainEvent);
        }
      }
      await markOutboxProcessed(row.id);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      failed++;
      errors.push({ eventId: row.id, error: error.message });
    }
  }

  return { claimed: pendingRows.length, processed, failed, errors };
}

// Register handlers into localRegistry
beforeAll(() => {
  // Import handlers and register them
  // Note: We use dynamic import to avoid circular dependencies
  import("@/lib/modules/accounting/handlers/order-payment-confirmed-handler").then(
    (m) => localRegistry.set("OrderPaymentConfirmed", [m.onOrderPaymentConfirmed as EventHandler])
  );
  import("@/lib/modules/accounting/handlers/order-cancelled-handler").then(
    (m) => localRegistry.set("OrderCancelled", [m.onOrderCancelled as EventHandler])
  );
  import("@/lib/modules/accounting/handlers/customer-created-handler").then(
    (m) => localRegistry.set("CustomerCreated", [m.onCustomerCreated as EventHandler])
  );
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Phase 4: Ecommerce Decoupling", () => {
  describe("OrderPaymentConfirmed", () => {
    it("emits OutboxEvent and confirms document via handler", async () => {
      // Setup: create warehouse, product, counterparty, document
      const warehouse = await createWarehouse({ tenantId: TENANT_ID });
      const product = await createProduct({ tenantId: TENANT_ID });
      const counterparty = await createCounterparty({ tenantId: TENANT_ID });
      const document = await createDocument({
        tenantId: TENANT_ID,
        type: "sales_order",
        status: "draft",
        counterpartyId: counterparty.id,
        warehouseId: warehouse.id,
      });
      await createDocumentItem(
        document.id,
        product.id,
        { quantity: 1, price: 100 }
      );

      // Create OrderPaymentConfirmed event
      // Use PostgreSQL NOW() for availableAt to avoid clock skew
      const [{ now: availableAt }] = await db.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
      const eventPayload = {
        type: "OrderPaymentConfirmed" as const,
        occurredAt: availableAt,
        payload: {
          orderId: document.id,
          tenantId: TENANT_ID,
          documentId: document.id,
          customerId: "test-customer",
          amount: 100,
          paymentMethod: "card",
          actor: "test-user",
        },
      };

      await db.outboxEvent.create({
        data: {
          eventType: "OrderPaymentConfirmed",
          aggregateType: "Order",
          aggregateId: document.id,
          payload: eventPayload as unknown as Prisma.JsonObject,
          status: "PENDING",
          attempts: 0,
          availableAt,
        },
      });

      // Process events
      const result = await driveHandlers(10);
      expect(result.claimed).toBe(1);
      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);

      // Verify document is confirmed
      const confirmedDoc = await db.document.findUnique({
        where: { id: document.id },
      });
      expect(confirmedDoc?.status).toBe("confirmed");
      expect(confirmedDoc?.confirmedAt).toBeTruthy();
    });
  });

  describe("CustomerCreated", () => {
    it("is idempotent - only one Counterparty created for duplicate events", async () => {
      const customerId = "test-customer-id-" + Date.now();

      // Create customer first
      await db.customer.create({
        data: {
          id: customerId,
          name: "Test Customer",
          email: "test@example.com",
          phone: "+1234567890",
        },
      });

      // Create first CustomerCreated event
      // Use PostgreSQL NOW() for availableAt to avoid clock skew
      const [{ now: availableAt1 }] = await db.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
      const eventPayload = {
        type: "CustomerCreated" as const,
        occurredAt: availableAt1,
        payload: {
          customerId,
          tenantId: TENANT_ID,
          email: "test@example.com",
          name: "Test Customer",
          phone: "+1234567890",
          telegramId: null,
          telegramUsername: null,
        },
      };

      await db.outboxEvent.create({
        data: {
          eventType: "CustomerCreated",
          aggregateType: "Customer",
          aggregateId: customerId,
          payload: eventPayload as unknown as Prisma.JsonObject,
          status: "PENDING",
          attempts: 0,
          availableAt: availableAt1,
        },
      });

      // Process first event
      const result1 = await driveHandlers(10);
      expect(result1.processed).toBeGreaterThanOrEqual(1);

      // Verify counterparty was created
      const customerAfter1 = await db.customer.findUnique({
        where: { id: customerId },
        include: { counterparty: true },
      });
      expect(customerAfter1?.counterpartyId).toBeTruthy();
      const counterpartyId1 = customerAfter1!.counterpartyId;

      // Create second CustomerCreated event (duplicate)
      // Use PostgreSQL NOW() for availableAt to avoid clock skew
      const [{ now: availableAt2 }] = await db.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
      await db.outboxEvent.create({
        data: {
          eventType: "CustomerCreated",
          aggregateType: "Customer",
          aggregateId: customerId,
          payload: eventPayload as unknown as Prisma.JsonObject,
          status: "PENDING",
          attempts: 0,
          availableAt: availableAt2,
        },
      });

      // Process second event
      const result2 = await driveHandlers(10);
      expect(result2.processed).toBeGreaterThanOrEqual(1);

      // Verify no duplicate counterparty
      const customerAfter2 = await db.customer.findUnique({
        where: { id: customerId },
        include: { counterparty: true },
      });
      expect(customerAfter2?.counterpartyId).toBe(counterpartyId1);

      // Verify only one counterparty exists for this customer
      const counterparties = await db.counterparty.findMany({
        where: { customer: { id: customerId } },
      });
      expect(counterparties.length).toBe(1);
    });
  });

  describe("Customer → Counterparty relation", () => {
    it("onDelete: SetNull - Counterparty survives Customer deletion", async () => {
      // Create customer with counterparty
      const customer = await db.customer.create({
        data: {
          name: "To Be Deleted",
          email: "delete@example.com",
        },
      });

      // Create counterparty linked to customer
      const counterparty = await db.counterparty.create({
        data: {
          tenantId: TENANT_ID,
          type: "customer",
          name: "Test Counterparty",
          email: "delete@example.com",
        },
      });

      // Link customer to counterparty
      await db.customer.update({
        where: { id: customer.id },
        data: { counterpartyId: counterparty.id },
      });

      // Verify link exists
      const beforeDelete = await db.customer.findUnique({
        where: { id: customer.id },
      });
      expect(beforeDelete?.counterpartyId).toBe(counterparty.id);

      // Delete customer
      await db.customer.delete({
        where: { id: customer.id },
      });

      // Verify counterparty still exists
      const counterpartyAfter = await db.counterparty.findUnique({
        where: { id: counterparty.id },
      });
      expect(counterpartyAfter).toBeTruthy();
      expect(counterpartyAfter?.name).toBe("Test Counterparty");
    });
  });
});

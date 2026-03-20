/**
 * Counterparty Bridge Service.
 *
 * Bridges Customer entities to ERP Counterparty entities.
 * Ensures INV-01: Every Counterparty has a Party mirror.
 *
 * Phase 4: Decoupled from accounting module.
 * Emits CustomerCreated event for processing by accounting handlers.
 * The handler creates Counterparty + Party mirror atomically.
 *
 * Note: This service now emits events and waits for processing.
 * The counterpartyId is needed immediately for order creation,
 * so we process events synchronously.
 */

import { db } from "@/lib/shared/db";
import { createOutboxEvent, processOutboxEvents } from "@/lib/events/outbox";

/**
 * Get or create Counterparty for Customer.
 * Called when customer places their first order.
 *
 * Phase 4: Emits CustomerCreated event which triggers counterparty creation
 * in accounting module. The event is processed immediately to ensure
 * counterpartyId is available for order creation.
 */
export async function getOrCreateCounterparty(
  customerId: string,
  tenantId: string
): Promise<string> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { counterparty: true },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.counterpartyId && customer.counterparty) {
    return customer.counterpartyId;
  }

  // Emit CustomerCreated event - handler will create Counterparty + Party
  const occurredAt = new Date();

  await db.$transaction(async (tx) => {
    await createOutboxEvent(
      tx,
      {
        type: "CustomerCreated",
        occurredAt,
        payload: {
          customerId,
          tenantId,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          telegramId: customer.telegramId,
          telegramUsername: customer.telegramUsername,
        },
      },
      "Customer",
      customerId
    );
  });

  // Process events immediately - counterpartyId is needed for order creation
  await processOutboxEvents(10);

  // Fetch the updated customer to get the counterpartyId
  const updatedCustomer = await db.customer.findUnique({
    where: { id: customerId },
    select: { counterpartyId: true },
  });

  if (!updatedCustomer || !updatedCustomer.counterpartyId) {
    throw new Error("Failed to create counterparty for customer");
  }

  return updatedCustomer.counterpartyId;
}

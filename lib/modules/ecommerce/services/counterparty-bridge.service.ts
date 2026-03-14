/**
 * Counterparty Bridge Service.
 *
 * Bridges Customer entities to ERP Counterparty entities.
 * Ensures INV-01: Every Counterparty has a Party mirror.
 */

import { db } from "@/lib/shared/db";
import { createCounterpartyWithParty } from "@/lib/modules/accounting/services/counterparty.service";

/**
 * Get or create Counterparty for Customer.
 * Called when customer places their first order.
 *
 * Uses createCounterpartyWithParty() to atomically create both the
 * Counterparty and its CRM Party mirror (INV-01 enforcement).
 * The customer.counterpartyId link is updated in the same db.$transaction().
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

  const { counterparty } = await createCounterpartyWithParty({
    tenantId,
    type: "customer",
    name: customer.name || `Клиент Telegram`,
    phone: customer.phone,
    email: customer.email,
    notes: `Telegram: @${customer.telegramUsername || customer.telegramId}`,
  });

  await db.customer.update({
    where: { id: customerId },
    data: { counterpartyId: counterparty.id },
  });

  return counterparty.id;
}

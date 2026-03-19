/**
 * Counterparty Bridge Service.
 *
 * Bridges Customer entities to ERP Counterparty entities.
 * Ensures INV-01: Every Counterparty has a Party mirror.
 */

import { db } from "@/lib/shared/db";
import { createCounterpartyWithParty } from "@/lib/modules/accounting";

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

  // Atomic transaction: Counterparty creation + Customer link
  const { counterparty } = await db.$transaction(async (tx) => {
    const result = await createCounterpartyWithParty(
      {
        tenantId,
        type: "customer",
        name: customer.name || `Клиент Telegram`,
        phone: customer.phone,
        email: customer.email,
        notes: `Telegram: @${customer.telegramUsername || customer.telegramId}`,
      },
      tx
    );

    await tx.customer.update({
      where: { id: customerId },
      data: { counterpartyId: result.counterparty.id },
    });

    return result;
  });

  return counterparty.id;
}

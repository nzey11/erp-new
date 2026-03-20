/**
 * Accounting handler — Create Counterparty on CustomerCreated
 *
 * Reacts to CustomerCreated by creating a Counterparty linked to the Customer.
 * Idempotent: checks if counterparty already exists for this customer.
 *
 * Uses Serializable transaction isolation with retry logic to prevent
 * concurrent creation of duplicate counterparties.
 *
 * This handler bridges ecommerce module to accounting module without
 * direct imports from ecommerce to accounting services.
 */

import type { CustomerCreatedEvent } from "@/lib/events/types";
import { db } from "@/lib/shared/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { resolveParty } from "@/lib/domain/party";

const MAX_RETRIES = 3;

export async function onCustomerCreated(
  event: CustomerCreatedEvent
): Promise<void> {
  const { customerId, tenantId, email, name, phone, telegramId, telegramUsername } = event.payload;

  // Idempotency check: check if customer already has a counterparty
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { counterpartyId: true },
  });

  if (!customer) {
    // Customer not found, nothing to do
    return;
  }

  if (customer.counterpartyId) {
    // Customer already has a counterparty, skip
    return;
  }

  // Build counterparty name
  const counterpartyName = name || 
    (telegramUsername ? `@${telegramUsername}` : null) ||
    (telegramId ? `Telegram ${telegramId}` : null) ||
    email ||
    `Customer ${customerId.slice(0, 8)}`;

  // Build notes from Telegram info
  const notes = telegramUsername || telegramId
    ? `Telegram: @${telegramUsername || telegramId}`
    : null;

  // Create counterparty with Serializable isolation and retry logic
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await db.$transaction(
        async (tx) => {
          // Double-check idempotency inside transaction
          const customerInTx = await tx.customer.findUnique({
            where: { id: customerId },
            select: { counterpartyId: true },
          });

          if (!customerInTx || customerInTx.counterpartyId) {
            return; // Customer not found or already has counterparty, skip
          }

          // Create the Counterparty
          const counterparty = await tx.counterparty.create({
            data: {
              tenantId,
              type: "customer",
              name: counterpartyName,
              email,
              phone,
              notes,
            },
          });

          // Create initial balance record
          await tx.counterpartyBalance.create({
            data: { counterpartyId: counterparty.id, balanceRub: 0 },
          });

          // Link Customer to Counterparty
          await tx.customer.update({
            where: { id: customerId },
            data: { counterpartyId: counterparty.id },
          });

          // Create Party mirror for CRM (INV-01)
          // Note: resolveParty uses global db, not tx, but we've already created
          // the counterparty so it should work. If it fails, the transaction
          // will roll back the counterparty creation.
          await resolveParty({ counterpartyId: counterparty.id });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        }
      );

      // Success, exit retry loop
      break;
    } catch (e: unknown) {
      const error = e as { code?: string };
      // P2034 = Transaction conflict, retry
      if (error.code === "P2034" && retries < MAX_RETRIES - 1) {
        retries++;
        continue;
      }
      throw e;
    }
  }
}

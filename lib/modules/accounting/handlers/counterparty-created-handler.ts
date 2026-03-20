/**
 * Accounting handler — Counterparty Created Event
 *
 * Reacts to CounterpartyCreated by syncing party data if needed.
 * Idempotent: checks if party already exists for this counterpartyId.
 *
 * Phase 5: Basic implementation with observability.
 * Future: Add CRM sync logic when CRM module is implemented.
 */

import type { CounterpartyCreatedEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import { logger } from "@/lib/shared/logger";

export async function onCounterpartyCreated(
  event: CounterpartyCreatedEvent
): Promise<void> {
  const { counterpartyId, tenantId, customerId, name, type } = event.payload;

  // Idempotency check: verify counterparty exists
  const counterparty = await db.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { id: true, name: true, type: true },
  });

  if (!counterparty) {
    logger.warn("counterparty-created-handler", `Counterparty not found: ${counterpartyId}`);
    return;
  }

  // Log for observability
  logger.info("counterparty-created-handler", `Counterparty created`, {
    counterpartyId,
    tenantId,
    customerId,
    name,
    type,
  });

  // Phase 5: CRM sync would go here if needed
  // For now, the counterparty is already created with a Party mirror
  // Future enhancement: sync to external CRM systems
}

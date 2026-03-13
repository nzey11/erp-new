/**
 * Accounting handler — Balance
 *
 * Reacts to DocumentConfirmed by recalculating the counterparty balance.
 * Runs only for document types that affect balance (incoming/outgoing shipments,
 * payments, returns) and only when a counterpartyId is present.
 */

import type { DocumentConfirmedEvent } from "@/lib/events";
import { affectsBalance } from "@/lib/modules/accounting/finance/predicates";
import { recalculateBalance } from "@/lib/modules/finance/reports";

export async function onDocumentConfirmedBalance(
  event: DocumentConfirmedEvent
): Promise<void> {
  const { documentType, counterpartyId } = event.payload;

  if (!affectsBalance(documentType) || !counterpartyId) return;

  await recalculateBalance(counterpartyId);
}

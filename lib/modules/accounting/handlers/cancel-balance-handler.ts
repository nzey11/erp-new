/**
 * Accounting handler — Balance on Cancel
 *
 * Reacts to DocumentCancelled by recalculating the counterparty balance.
 * Runs only for document types that affect balance (incoming/outgoing shipments,
 * payments, returns) and only when a counterpartyId is present.
 */

import type { DocumentCancelledEvent } from "@/lib/events";
import { affectsBalance } from "@/lib/modules/accounting/finance/predicates";
import { recalculateBalance } from "@/lib/modules/accounting/services/balance.service";

export async function onDocumentCancelledBalance(
  event: DocumentCancelledEvent
): Promise<void> {
  const { documentType, counterpartyId, documentId, documentNumber } = event.payload;

  console.log(`[BALANCE DEBUG] onDocumentCancelledBalance called: doc=${documentNumber}(${documentId}), type=${documentType}, counterpartyId=${counterpartyId}`);
  console.log(`[BALANCE DEBUG] affectsBalance(${documentType})=${affectsBalance(documentType)}`);

  if (!affectsBalance(documentType) || !counterpartyId) {
    console.log(`[BALANCE DEBUG] SKIPPING: affectsBalance=${affectsBalance(documentType)}, hasCounterparty=${!!counterpartyId}`);
    return;
  }

  console.log('[BALANCE DEBUG] calling recalculateBalance for counterparty:', counterpartyId);
  await recalculateBalance(counterpartyId);
  console.log('[BALANCE DEBUG] recalculateBalance completed for counterparty:', counterpartyId);
}

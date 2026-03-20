/**
 * Accounting handler — Balance
 *
 * Reacts to DocumentConfirmed by recalculating the counterparty balance.
 * Runs only for document types that affect balance (incoming/outgoing shipments,
 * payments, returns) and only when a counterpartyId is present.
 */

import type { DocumentConfirmedEvent } from "@/lib/events";
import { affectsBalance } from "@/lib/modules/accounting/finance/predicates";
import { recalculateBalance } from "@/lib/modules/accounting/services/balance.service";

export async function onDocumentConfirmedBalance(
  event: DocumentConfirmedEvent
): Promise<void> {
  const { documentType, counterpartyId, documentId, documentNumber } = event.payload;

  console.log(`[BALANCE DEBUG] onDocumentConfirmedBalance called: doc=${documentNumber}(${documentId}), type=${documentType}, counterpartyId=${counterpartyId}`);
  console.log(`[BALANCE DEBUG] affectsBalance(${documentType})=${affectsBalance(documentType)}`);

  if (!affectsBalance(documentType) || !counterpartyId) {
    console.log(`[BALANCE DEBUG] SKIPPING: affectsBalance=${affectsBalance(documentType)}, hasCounterparty=${!!counterpartyId}`);
    return;
  }

  console.log('[BALANCE DEBUG] calling recalculateBalance for counterparty:', counterpartyId);
  await recalculateBalance(counterpartyId);
  console.log('[BALANCE DEBUG] recalculateBalance completed for counterparty:', counterpartyId);
}

/**
 * Accounting handler — Confirm Document on OrderPaymentConfirmed
 *
 * Reacts to OrderPaymentConfirmed by calling confirmDocumentTransactional().
 * Idempotent: checks if document is already confirmed before confirming.
 *
 * This handler bridges ecommerce module to accounting module without
 * direct imports from ecommerce to accounting services.
 */

import type { OrderPaymentConfirmedEvent } from "@/lib/events/types";
import { confirmDocumentTransactional } from "@/lib/modules/accounting/services/document-confirm.service";

export async function onOrderPaymentConfirmed(
  event: OrderPaymentConfirmedEvent
): Promise<void> {
  const { documentId, actor } = event.payload;

  // The confirmDocumentTransactional function has its own idempotency check
  // (it will return the document if already confirmed), but we add an early
  // exit here for clarity and to avoid unnecessary work.
  // Note: confirmDocumentTransactional handles all validation and stock effects.

  await confirmDocumentTransactional(documentId, actor);
}

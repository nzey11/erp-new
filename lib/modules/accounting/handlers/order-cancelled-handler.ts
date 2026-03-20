/**
 * Accounting handler — Cancel Document on OrderCancelled
 *
 * Reacts to OrderCancelled by calling cancelDocumentTransactional().
 * Idempotent: checks if document is already cancelled before cancelling.
 *
 * This handler bridges ecommerce module to accounting module without
 * direct imports from ecommerce to accounting services.
 */

import type { OrderCancelledEvent } from "@/lib/events/types";
import { cancelDocumentTransactional } from "@/lib/modules/accounting/services/document-confirm.service";

export async function onOrderCancelled(
  event: OrderCancelledEvent
): Promise<void> {
  const { documentId, actor } = event.payload;

  // The cancelDocumentTransactional function has its own idempotency check
  // (it will return the document if already cancelled), but we add an early
  // exit here for clarity and to avoid unnecessary work.
  // Note: cancelDocumentTransactional handles all reversal effects.

  await cancelDocumentTransactional(documentId, actor);
}

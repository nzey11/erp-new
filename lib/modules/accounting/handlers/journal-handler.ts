/**
 * Accounting handler — Journal
 *
 * Reacts to DocumentConfirmed by auto-posting the document to the
 * double-entry journal. Idempotent: autoPostDocument checks for
 * an existing entry and returns early if already posted.
 */

import type { DocumentConfirmedEvent } from "@/lib/events";
import { autoPostDocument } from "@/lib/modules/accounting/finance/journal";

export async function onDocumentConfirmedJournal(
  event: DocumentConfirmedEvent
): Promise<void> {
  const { documentId, documentNumber, confirmedAt, confirmedBy } = event.payload;

  console.log(`[JOURNAL DEBUG] onDocumentConfirmedJournal called: doc=${documentNumber}(${documentId})`);

  try {
    await autoPostDocument(
      documentId,
      documentNumber,
      confirmedAt,
      confirmedBy ?? undefined
    );
    console.log(`[JOURNAL DEBUG] autoPostDocument completed for doc=${documentNumber}`);
  } catch (e) {
    console.error(`[JOURNAL DEBUG] autoPostDocument FAILED for doc=${documentNumber}:`, e);
    throw e;
  }
}

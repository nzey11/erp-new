/**
 * Accounting handler — Journal Reversal on Cancel
 *
 * Reacts to DocumentCancelled by reversing all journal entries
 * for the document. Idempotent: reverseEntry checks if already reversed.
 *
 * Race condition handling: if journal entries don't exist yet
 * (DocumentConfirmed outbox not processed), auto-post them first.
 */

import type { DocumentCancelledEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import { reverseEntry, autoPostDocument } from "@/lib/modules/accounting/finance/journal";

export async function onDocumentCancelledJournal(
  event: DocumentCancelledEvent
): Promise<void> {
  const { documentId, documentNumber, cancelledBy, cancelledAt } = event.payload;

  // Idempotency check: if reversal entries already exist for this document, skip
  const existingReversal = await db.journalEntry.findFirst({
    where: {
      sourceId: documentId,
      isManual: true, // Reversal entries are manual
      description: { contains: "сторно" },
    },
  });
  if (existingReversal) {
    // Already reversed, skip to avoid duplicate entries
    return;
  }

  // Find all non-reversed journal entries for this document
  let journalEntries = await db.journalEntry.findMany({
    where: {
      sourceId: documentId,
      isReversed: false,
    },
    select: { id: true, number: true },
  });

  // Race condition: DocumentConfirmed outbox not processed yet
  // Auto-post journal entries first, then reverse them
  if (journalEntries.length === 0) {
    // Check if document affects balance (should have journal entries)
    const doc = await db.document.findUnique({
      where: { id: documentId },
      select: { date: true, number: true },
    });

    if (doc) {
      await autoPostDocument(documentId, doc.number, doc.date);

      // Re-fetch journal entries after auto-post
      journalEntries = await db.journalEntry.findMany({
        where: {
          sourceId: documentId,
          isReversed: false,
        },
        select: { id: true, number: true },
      });
    }
  }

  if (journalEntries.length === 0) {
    return;
  }

  // Reverse each entry
  for (const entry of journalEntries) {
    await reverseEntry(entry.id, {
      date: cancelledAt,
      description: `Отмена документа ${documentNumber} — сторно проводки ${entry.number}`,
      createdBy: cancelledBy ?? undefined,
      bypassAutoCheck: true, // Allow reversing auto-generated entries
      allowRestrictedAccounts: true, // Allow reversing entries with 60/62 accounts
    });
  }
}

/**
 * Accounting handler — Journal Reversal on Payment Deleted
 *
 * Reacts to PaymentDeleted by reversing the journal entry for the payment.
 * Idempotent: checks if reversal already exists before creating.
 *
 * Uses Serializable transaction isolation with retry logic to prevent
 * concurrent creation of duplicate reversals.
 */

import type { PaymentDeletedEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import { Prisma } from "@/lib/generated/prisma/client";

const MAX_RETRIES = 3;

export async function onPaymentDeleted(
  event: PaymentDeletedEvent
): Promise<void> {
  const { paymentId, counterpartyId } = event.payload;

  // Find the original journal entry for this payment
  const originalEntry = await db.journalEntry.findFirst({
    where: {
      sourceId: paymentId,
      sourceType: "finance_payment",
      isReversed: false,
    },
  });

  if (!originalEntry) {
    // No entry to reverse, might have been already reversed or never created
    return;
  }

  // Idempotency check: check if reversal already exists
  const existingReversal = await db.journalEntry.findFirst({
    where: {
      reversedById: originalEntry.id,
    },
  });

  if (existingReversal) {
    // Reversal already exists, skip to avoid duplicates
    return;
  }

  // Generate reversal journal entry number
  const counter = await db.journalCounter.upsert({
    where: { prefix: "JE" },
    update: { lastNumber: { increment: 1 } },
    create: { prefix: "JE", lastNumber: 1 },
  });
  const reversalNumber = `JE-${String(counter.lastNumber).padStart(6, "0")}`;

  const reversalDescription = `Сторно проводки ${originalEntry.number} — удаление платежа`;

  // Create reversal with Serializable isolation and retry logic
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await db.$transaction(
        async (tx) => {
          // Double-check idempotency inside transaction
          const existingInTx = await tx.journalEntry.findFirst({
            where: {
              reversedById: originalEntry.id,
            },
          });

          if (existingInTx) {
            return; // Already reversed, skip
          }

          // Get original lines to swap debit/credit
          const originalLines = await tx.ledgerLine.findMany({
            where: { entryId: originalEntry.id },
          });

          if (originalLines.length !== 2) {
            throw new Error(
              `Expected 2 lines in original entry, found ${originalLines.length}`
            );
          }

          // Create reversal entry with swapped debit/credit
          await tx.journalEntry.create({
            data: {
              number: reversalNumber,
              date: new Date(),
              description: reversalDescription,
              sourceType: "finance_payment",
              sourceId: paymentId,
              sourceNumber: originalEntry.sourceNumber,
              isManual: true,
              isReversed: false,
              reversedById: originalEntry.id,
              createdBy: null,
              lines: {
                create: originalLines.map((line) => ({
                  accountId: line.accountId,
                  debit: line.credit, // Swap
                  credit: line.debit, // Swap
                  counterpartyId: line.counterpartyId ?? counterpartyId ?? null,
                  currency: line.currency,
                  amountRub: line.amountRub,
                })),
              },
            },
          });

          // Mark original as reversed
          await tx.journalEntry.update({
            where: { id: originalEntry.id },
            data: { isReversed: true },
          });
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

  // Recalculate counterparty balance if applicable
  if (counterpartyId) {
    try {
      const { recalculateBalance } = await import(
        "@/lib/modules/accounting/services/balance.service"
      );
      console.log('[BALANCE DEBUG] called from:', new Error().stack?.split('\n')[2]);
      await recalculateBalance(counterpartyId);
    } catch {
      // Non-critical: balance recalculation failure shouldn't fail the reversal
    }
  }
}

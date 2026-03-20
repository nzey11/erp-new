/**
 * Accounting handler — Journal Entry on Payment Created
 *
 * Reacts to PaymentCreated by creating a journal entry for the payment.
 * Idempotent: checks if journal entry for paymentId already exists before creating.
 *
 * Uses Serializable transaction isolation with retry logic to prevent
 * concurrent creation of duplicate entries.
 */

import type { PaymentCreatedEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import { Prisma } from "@/lib/generated/prisma/client";

const MAX_RETRIES = 3;

export async function onPaymentCreated(
  event: PaymentCreatedEvent
): Promise<void> {
  const {
    paymentId,
    tenantId: _tenantId,
    amount,
    counterpartyId,
    type,
    paymentMethod,
    categoryId,
    date,
    description,
    createdBy,
  } = event.payload;

  // Idempotency check: check if journal entry already exists for this payment
  const existingEntry = await db.journalEntry.findFirst({
    where: {
      sourceId: paymentId,
      sourceType: "finance_payment",
    },
  });

  if (existingEntry) {
    // Journal entry already exists, skip to avoid duplicates
    return;
  }

  // Get category for account code
  const category = await db.financeCategory.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new Error(`Finance category not found: ${categoryId}`);
  }

  // Determine account codes
  const cashAccountCode = paymentMethod === "cash" ? "50" : "51";
  const categoryAccountCode =
    category.defaultAccountCode ?? (type === "income" ? "91.1" : "91.2");

  // Get accounts
  const [cashAccount, categoryAccount] = await Promise.all([
    db.account.findUnique({ where: { code: cashAccountCode } }),
    db.account.findUnique({ where: { code: categoryAccountCode } }),
  ]);

  if (!cashAccount || !categoryAccount) {
    throw new Error(
      `Required accounts not found: ${cashAccountCode} or ${categoryAccountCode}`
    );
  }

  // Determine debit/credit based on payment type
  // Income:  Дт 50/51 (cash/bank) Кт 91.1 (income)
  // Expense: Дт 91.2 (expense) Кт 50/51 (cash/bank)
  const debitAccountId = type === "income" ? cashAccount.id : categoryAccount.id;
  const creditAccountId = type === "income" ? categoryAccount.id : cashAccount.id;

  // Generate journal entry number
  const counter = await db.journalCounter.upsert({
    where: { prefix: "JE" },
    update: { lastNumber: { increment: 1 } },
    create: { prefix: "JE", lastNumber: 1 },
  });
  const jeNumber = `JE-${String(counter.lastNumber).padStart(6, "0")}`;

  const entryDescription = description
    ? `${category.name}: ${description}`
    : category.name;

  // Create journal entry with Serializable isolation and retry logic
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await db.$transaction(
        async (tx) => {
          // Double-check idempotency inside transaction
          const existingInTx = await tx.journalEntry.findFirst({
            where: {
              sourceId: paymentId,
              sourceType: "finance_payment",
            },
          });

          if (existingInTx) {
            return; // Already exists, skip
          }

          // Create journal entry
          await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date,
              description: entryDescription,
              sourceType: "finance_payment",
              sourceId: paymentId,
              sourceNumber: jeNumber,
              isManual: false,
              createdBy,
              lines: {
                create: [
                  {
                    accountId: debitAccountId,
                    debit: amount,
                    credit: 0,
                    counterpartyId: counterpartyId ?? null,
                    currency: "RUB",
                    amountRub: amount,
                  },
                  {
                    accountId: creditAccountId,
                    debit: 0,
                    credit: amount,
                    counterpartyId: counterpartyId ?? null,
                    currency: "RUB",
                    amountRub: amount,
                  },
                ],
              },
            },
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
}

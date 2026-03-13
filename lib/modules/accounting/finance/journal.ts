/**
 * Finance domain — Journal Entry management.
 * Core double-entry bookkeeping engine.
 *
 * Phase 1.4: moved from lib/modules/accounting/journal.ts
 * Import path changed to @/lib/modules/accounting/finance/journal
 */

import { db } from "@/lib/shared/db";
import { buildPostingLines, resolvePostingAccounts } from "./posting-rules";

// =============================================
// Domain Errors
// =============================================

/**
 * Thrown when attempting to reverse an auto-generated journal entry.
 * Auto-generated entries must be reversed through document lifecycle.
 */
export class CannotReverseAutoEntryError extends Error {
  constructor(
    public sourceType: string,
    public sourceId: string,
    public sourceNumber?: string
  ) {
    super(
      `Эта проводка создана автоматически из документа${
        sourceNumber ? ` ${sourceNumber}` : ""
      }. Отмена должна выполняться через отмену или корректировку исходного документа.`
    );
    this.name = "CannotReverseAutoEntryError";
  }
}

/**
 * Thrown when attempting to create or reverse a journal entry
 * involving restricted AR/AP accounts (60*, 62*) without permission.
 */
export class RestrictedAccountPermissionError extends Error {
  constructor(public accountCodes: string[]) {
    super(
      `Для проводок по счетам ${accountCodes.join(", ")} требуется разрешение journal:manualRestrictedAccounts`
    );
    this.name = "RestrictedAccountPermissionError";
  }
}

/**
 * Check if an account code is a restricted AR/AP account.
 * Restricted: 60* (Accounts Payable) and 62* (Accounts Receivable)
 */
export function isRestrictedAccountCode(code: string): boolean {
  return code.startsWith("60") || code.startsWith("62");
}

export interface JournalEntryInput {
  date?: Date;
  description?: string;
  sourceType?: string;
  sourceId?: string;
  sourceNumber?: string;
  isManual?: boolean;
  createdBy?: string;
  lines: {
    debitAccountCode: string;
    creditAccountCode: string;
    amount: number;
    counterpartyId?: string;
    warehouseId?: string;
    productId?: string;
  }[];
}

/** Get next journal entry number */
async function getNextJournalNumber(): Promise<string> {
  const counter = await db.journalCounter.upsert({
    where: { prefix: "JE" },
    update: { lastNumber: { increment: 1 } },
    create: { prefix: "JE", lastNumber: 1 },
  });
  return `JE-${String(counter.lastNumber).padStart(6, "0")}`;
}

/**
 * Create a manual journal entry
 *
 * Guards:
 * - Restricted accounts (60*, 62*) require allowRestrictedAccounts option
 */
export async function createJournalEntry(
  input: JournalEntryInput,
  options?: { allowRestrictedAccounts?: boolean }
) {
  // Guard: Check restricted accounts (60*, 62*)
  const restrictedCodes = [
    ...new Set(
      input.lines.flatMap((line) => [line.debitAccountCode, line.creditAccountCode])
        .filter((code) => isRestrictedAccountCode(code))
    ),
  ];

  if (restrictedCodes.length > 0 && !options?.allowRestrictedAccounts) {
    throw new RestrictedAccountPermissionError(restrictedCodes);
  }

  const number = await getNextJournalNumber();

  // Resolve account codes to IDs
  const resolvedLines: {
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    counterpartyId?: string;
    warehouseId?: string;
    productId?: string;
  }[] = [];

  for (const line of input.lines) {
    const debitAcc = await db.account.findUnique({
      where: { code: line.debitAccountCode },
    });
    const creditAcc = await db.account.findUnique({
      where: { code: line.creditAccountCode },
    });

    if (!debitAcc) throw new Error(`Debit account not found: ${line.debitAccountCode}`);
    if (!creditAcc) throw new Error(`Credit account not found: ${line.creditAccountCode}`);

    resolvedLines.push({
      debitAccountId: debitAcc.id,
      creditAccountId: creditAcc.id,
      amount: line.amount,
      counterpartyId: line.counterpartyId,
      warehouseId: line.warehouseId,
      productId: line.productId,
    });
  }

  // Build ledger lines (each accounting line generates one debit + one credit line)
  const ledgerLinesData = resolvedLines.flatMap((line) => [
    {
      accountId: line.debitAccountId,
      debit: line.amount,
      credit: 0,
      counterpartyId: line.counterpartyId ?? null,
      warehouseId: line.warehouseId ?? null,
      productId: line.productId ?? null,
      currency: "RUB",
      amountRub: line.amount,
    },
    {
      accountId: line.creditAccountId,
      debit: 0,
      credit: line.amount,
      counterpartyId: line.counterpartyId ?? null,
      warehouseId: line.warehouseId ?? null,
      productId: line.productId ?? null,
      currency: "RUB",
      amountRub: line.amount,
    },
  ]);

  // Validate balance: sum of all debit ledger lines must equal sum of all credit ledger lines
  const totalDebit = ledgerLinesData.filter((l) => l.debit > 0).reduce((s, l) => s + l.debit, 0);
  const totalCredit = ledgerLinesData.filter((l) => l.credit > 0).reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry is unbalanced: debit=${totalDebit}, credit=${totalCredit}`);
  }

  return db.journalEntry.create({
    data: {
      number,
      date: input.date ?? new Date(),
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceNumber: input.sourceNumber,
      isManual: input.isManual ?? false,
      createdBy: input.createdBy,
      lines: { create: ledgerLinesData },
    },
    include: { lines: true },
  });
}

/**
 * Auto-post a confirmed document to the journal.
 * Called from document confirmation flow.
 */
export async function autoPostDocument(
  documentId: string,
  documentNumber: string,
  documentDate: Date,
  createdBy?: string
): Promise<void> {
  // Check if already posted
  const existing = await db.journalEntry.findFirst({
    where: { sourceId: documentId, isReversed: false },
  });
  if (existing) return; // Already posted, idempotent

  const postingLines = await buildPostingLines(documentId);
  if (!postingLines || postingLines.length === 0) return; // No posting rules for this type

  const resolved = await resolvePostingAccounts(postingLines);
  if (resolved.length === 0) return;

  const number = await getNextJournalNumber();

  // Get document type for description
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { type: true },
  });

  const ledgerLinesData = resolved.flatMap((line) => [
    {
      accountId: line.debitAccountId,
      debit: line.amount,
      credit: 0,
      counterpartyId: line.counterpartyId ?? null,
      warehouseId: line.warehouseId ?? null,
      productId: line.productId ?? null,
      currency: "RUB",
      amountRub: line.amount,
    },
    {
      accountId: line.creditAccountId,
      debit: 0,
      credit: line.amount,
      counterpartyId: line.counterpartyId ?? null,
      warehouseId: line.warehouseId ?? null,
      productId: line.productId ?? null,
      currency: "RUB",
      amountRub: line.amount,
    },
  ]);

  await db.journalEntry.create({
    data: {
      number,
      date: documentDate,
      description: `Авто-проводка по документу ${documentNumber}`,
      sourceType: doc?.type ?? "unknown",
      sourceId: documentId,
      sourceNumber: documentNumber,
      isManual: false,
      createdBy: createdBy ?? null,
      lines: { create: ledgerLinesData },
    },
  });
}

/**
 * Reverse (сторно) a journal entry.
 * Creates a new entry with swapped debit/credit.
 *
 * Guards:
 * 1. Cannot reverse auto-generated entries (isManual === false) unless bypassAutoCheck is true
 * 2. Restricted accounts (60*, 62*) require allowRestrictedAccounts option
 *
 * @param entryId - The journal entry to reverse
 * @param options - Optional parameters
 * @param options.date - Date for the reversal entry
 * @param options.description - Description for the reversal entry
 * @param options.createdBy - User who initiated the reversal
 * @param options.allowRestrictedAccounts - Set by route after checking journal:manualRestrictedAccounts permission
 * @param options.bypassAutoCheck - INTERNAL USE ONLY: Bypass isManual check for document lifecycle operations
 */
export async function reverseEntry(
  entryId: string,
  options?: {
    date?: Date;
    description?: string;
    createdBy?: string;
    allowRestrictedAccounts?: boolean;
    /** @internal For document lifecycle operations only */
    bypassAutoCheck?: boolean;
  }
) {
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: { include: { account: true } } },
  });

  if (!entry) throw new Error("Journal entry not found");
  if (entry.isReversed) throw new Error("Entry is already reversed");

  // Guard 1: Block auto-generated entries (unless bypassed for document lifecycle)
  if (!entry.isManual && !options?.bypassAutoCheck) {
    throw new CannotReverseAutoEntryError(
      entry.sourceType ?? "unknown",
      entry.sourceId ?? "unknown",
      entry.sourceNumber ?? undefined
    );
  }

  // Guard 2: Check restricted accounts (60*, 62*)
  const restrictedAccountCodes = [
    ...new Set(
      entry.lines
        .map((line) => line.account.code)
        .filter((code) => isRestrictedAccountCode(code))
    ),
  ];

  if (restrictedAccountCodes.length > 0 && !options?.allowRestrictedAccounts) {
    throw new RestrictedAccountPermissionError(restrictedAccountCodes);
  }

  const number = await getNextJournalNumber();

  // Create reversal entry (swap debit/credit)
  const reversalLines = entry.lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
    counterpartyId: line.counterpartyId ?? null,
    warehouseId: line.warehouseId ?? null,
    productId: line.productId ?? null,
    currency: line.currency ?? "RUB",
    amountRub: line.amountRub,
  }));

  const reversal = await db.journalEntry.create({
    data: {
      number,
      date: options?.date ?? new Date(),
      description: options?.description ?? `Сторно проводки ${entry.number}`,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceNumber: entry.sourceNumber,
      isManual: true,
      createdBy: options?.createdBy ?? null,
      reversedById: entryId,
      lines: { create: reversalLines },
    },
    include: { lines: true },
  });

  // Mark original as reversed
  await db.journalEntry.update({
    where: { id: entryId },
    data: { isReversed: true },
  });

  return reversal;
}

/**
 * Auto-post a standalone Finance Payment to the journal.
 * income:  Дт [cash/bank] Кт [category.defaultAccountCode ?? "91.1"]
 * expense: Дт [category.defaultAccountCode ?? "91.2"] Кт [cash/bank]
 */
export async function autoPostPayment(paymentId: string): Promise<void> {
  // Idempotency: check if already posted
  const existing = await db.journalEntry.findFirst({
    where: { sourceId: paymentId, sourceType: "finance_payment", isReversed: false },
  });
  if (existing) return;

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { category: true },
  });
  if (!payment) return;

  // Cash account by payment method: cash → 50, bank_transfer/card → 51
  const cashAccountCode = payment.paymentMethod === "cash" ? "50" : "51";

  // Income category account (default 91.1), expense category account (default 91.2)
  // Cast needed until Prisma client is regenerated after migration
  const catData = payment.category as unknown as { defaultAccountCode?: string | null };
  const categoryAccountCode =
    catData.defaultAccountCode ??
    (payment.type === "income" ? "91.1" : "91.2");

  // Resolve accounts
  const [cashAccount, categoryAccount] = await Promise.all([
    db.account.findUnique({ where: { code: cashAccountCode } }),
    db.account.findUnique({ where: { code: categoryAccountCode } }),
  ]);

  if (!cashAccount || !categoryAccount) return; // Accounts not seeded yet — skip silently

  const number = await getNextJournalNumber();

  // income:  Дт cashAccount Кт categoryAccount
  // expense: Дт categoryAccount Кт cashAccount
  const debitAccountId  = payment.type === "income" ? cashAccount.id : categoryAccount.id;
  const creditAccountId = payment.type === "income" ? categoryAccount.id : cashAccount.id;

  const description = payment.description
    ? `${payment.category.name}: ${payment.description}`
    : payment.category.name;

  await db.journalEntry.create({
    data: {
      number,
      date: payment.date,
      description,
      sourceType: "finance_payment",
      sourceId: paymentId,
      sourceNumber: payment.number,
      isManual: false,
      createdBy: null,
      lines: {
        create: [
          {
            accountId: debitAccountId,
            debit: payment.amount,
            credit: 0,
            counterpartyId: payment.counterpartyId ?? null,
            currency: "RUB",
            amountRub: payment.amount,
          },
          {
            accountId: creditAccountId,
            debit: 0,
            credit: payment.amount,
            counterpartyId: payment.counterpartyId ?? null,
            currency: "RUB",
            amountRub: payment.amount,
          },
        ],
      },
    },
  });
}

/**
 * Get all journal entries for a given source document.
 */
export async function getEntriesForDocument(documentId: string) {
  return db.journalEntry.findMany({
    where: { sourceId: documentId },
    include: {
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Get paginated journal entries with filters.
 */
export async function getJournalEntries(params: {
  dateFrom?: Date;
  dateTo?: Date;
  isManual?: boolean;
  accountCode?: string;
  page?: number;
  limit?: number;
}) {
  const { dateFrom, dateTo, isManual, accountCode, page = 1, limit = 50 } = params;

  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    };
  }
  if (isManual !== undefined) where.isManual = isManual;

  // If filtering by account, need to join through lines
  if (accountCode) {
    const account = await db.account.findUnique({ where: { code: accountCode } });
    if (account) {
      where.lines = { some: { accountId: account.id } };
    }
  }

  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: {
        lines: { include: { account: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.journalEntry.count({ where }),
  ]);

  return { entries, total, page, limit };
}

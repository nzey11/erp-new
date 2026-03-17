/**
 * Accounting Layer Verification
 *
 * Verifies that the two independent accounting layers tell the same story
 * for a given counterparty:
 *
 *   Layer 1: CounterpartyBalance — denormalized projection from Document table
 *   Layer 2: LedgerLine         — double-entry ledger (accounts 60 / 62)
 *
 * The two layers are maintained independently and can diverge after:
 *   - Document cancellation (before Fix 1 was applied)
 *   - Direct DB patches
 *   - Outbox processing failures
 *
 * Use this for post-deploy verification and monitoring.
 */

import { db } from "@/lib/shared/db";

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

export interface AccountingVerificationResult {
  counterpartyId: string;
  counterpartyBalance: number;
  ledgerDebit: number;
  ledgerCredit: number;
  ledgerNet: number;
  diff: number;
  balanced: boolean;
}

/**
 * Verify that CounterpartyBalance matches LedgerLine net for a given counterparty.
 *
 * LedgerLine net for a counterparty:
 *   Account 62 (customers): net = debit - credit  (positive = they owe us)
 *   Account 60 (suppliers): net = credit - debit  (positive = we owe them, flipped sign to match balance convention)
 *
 * Note: LedgerLine.counterpartyId carries the counterparty reference
 * written by posting-rules.ts. This is the reliable join key.
 */
export async function verifyCounterpartyAccounting(
  counterpartyId: string
): Promise<AccountingVerificationResult> {
  // Layer 1: denormalized balance
  const balanceRow = await db.counterpartyBalance.findFirst({
    where: { counterpartyId },
    select: { balanceRub: true },
  });
  const counterpartyBalance = toNum(balanceRow?.balanceRub);

  // Layer 2: double-entry — aggregate LedgerLine by accounts 60 and 62
  // for lines attributed to this counterparty
  const [acct60, acct62] = await Promise.all([
    db.account.findUnique({ where: { code: "60" }, select: { id: true } }),
    db.account.findUnique({ where: { code: "62" }, select: { id: true } }),
  ]);

  const accountIds = [acct60?.id, acct62?.id].filter(Boolean) as string[];

  const ledgerAgg = await db.ledgerLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      counterpartyId,
      accountId: { in: accountIds },
    },
  });

  const ledgerDebit = toNum(ledgerAgg._sum.debit);
  const ledgerCredit = toNum(ledgerAgg._sum.credit);

  // Net interpretation:
  //   Дт 62 (debit on receivables) = they owe us → positive balance
  //   Кт 60 (credit on payables)   = we owe them → negative balance
  //   Match: CounterpartyBalance sign convention (positive = AR, negative = AP)
  const ledgerNet = ledgerDebit - ledgerCredit;

  const diff = Math.abs(counterpartyBalance - ledgerNet);
  const balanced = diff < 0.01;

  if (!balanced) {
    console.warn(
      `[verify-accounting] Discrepancy for counterparty ${counterpartyId}: ` +
      `CounterpartyBalance=${counterpartyBalance}, LedgerNet=${ledgerNet}, diff=${diff}`
    );
  }

  return {
    counterpartyId,
    counterpartyBalance,
    ledgerDebit,
    ledgerCredit,
    ledgerNet,
    diff,
    balanced,
  };
}

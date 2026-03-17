import { NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

export async function GET() {
  try {
    await requirePermission("reports:read");

    // Aggregate SUM(debit) and SUM(credit) per account
    const debits = await db.ledgerLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
    });

    // Build a map: accountId -> balance (debit - credit)
    const balanceMap = new Map<string, number>();
    for (const row of debits) {
      const d = toNumber(row._sum.debit);
      const c = toNumber(row._sum.credit);
      balanceMap.set(row.accountId, d - c);
    }

    return NextResponse.json(Object.fromEntries(balanceMap));
  } catch (error) {
    return handleAuthError(error);
  }
}

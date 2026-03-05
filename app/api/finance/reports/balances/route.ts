import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");

    const { searchParams } = new URL(request.url);
    const asOfDate = searchParams.get("asOfDate");

    const where: Record<string, unknown> = { NOT: { balanceRub: 0 } };
    if (asOfDate) {
      where.lastUpdatedAt = { lte: new Date(asOfDate + "T23:59:59.999Z") };
    }

    const balances = await db.counterpartyBalance.findMany({
      where,
      include: { counterparty: { select: { id: true, name: true, type: true } } },
      orderBy: { balanceRub: "desc" },
    });

    // Split into receivable (positive) and payable (negative)
    const receivable = balances.filter((b) => b.balanceRub > 0);
    const payable = balances.filter((b) => b.balanceRub < 0);

    const totalReceivable = receivable.reduce((sum, b) => sum + b.balanceRub, 0);
    const totalPayable = payable.reduce((sum, b) => sum + Math.abs(b.balanceRub), 0);

    return NextResponse.json({
      balances,
      receivable,
      payable,
      totalReceivable,
      totalPayable,
      netBalance: totalReceivable - totalPayable,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

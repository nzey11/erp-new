import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAllBalances } from "@/lib/modules/finance/reports";

export async function GET() {
  try {
    await requirePermission("reports:read");

    const balances = await getAllBalances();

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

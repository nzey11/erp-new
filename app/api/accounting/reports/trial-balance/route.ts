import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError, parseQuery } from "@/lib/shared/validation";
import { dateRangeSchema } from "@/lib/modules/finance/schemas/reports.schema";
import { getTrialBalance } from "@/lib/modules/accounting/balances";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");
    const query = parseQuery(request, dateRangeSchema);
    const rows = await getTrialBalance(new Date(query.dateFrom), new Date(query.dateTo));
    return NextResponse.json(rows);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

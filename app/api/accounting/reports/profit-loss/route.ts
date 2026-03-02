import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { dateRangeSchema } from "@/lib/modules/accounting/schemas/reports.schema";
import { generateProfitLoss } from "@/lib/modules/accounting/finance";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");

    const query = parseQuery(request, dateRangeSchema);

    const report = await generateProfitLoss(new Date(query.dateFrom), new Date(query.dateTo));

    return NextResponse.json(report);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

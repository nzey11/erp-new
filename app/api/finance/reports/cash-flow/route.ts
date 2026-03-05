import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { dateRangeSchema } from "@/lib/modules/finance/schemas/reports.schema";
import { generateCashFlow } from "@/lib/modules/finance/reports";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");

    const query = parseQuery(request, dateRangeSchema);

    // Parse dateTo as end-of-day to include all entries on that date
    const dateFrom = new Date(query.dateFrom);
    const dateTo = new Date(query.dateTo);
    dateTo.setUTCHours(23, 59, 59, 999);

    const report = await generateCashFlow(dateFrom, dateTo);

    return NextResponse.json(report);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

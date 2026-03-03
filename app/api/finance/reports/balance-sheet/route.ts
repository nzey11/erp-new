import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { z } from "zod";
import { generateBalanceSheet } from "@/lib/modules/finance/reports";

const dateSchema = z.object({
  asOfDate: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");

    const query = parseQuery(request, dateSchema);
    const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();

    const balanceSheet = await generateBalanceSheet(asOfDate);

    return NextResponse.json(balanceSheet);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

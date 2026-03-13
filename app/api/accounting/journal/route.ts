import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getJournalEntries } from "@/lib/modules/accounting/finance/journal";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");
    const { searchParams } = new URL(request.url);

    const rawDateFrom = searchParams.get("dateFrom");
    const rawDateTo = searchParams.get("dateTo");

    const dateFrom = rawDateFrom && !isNaN(Date.parse(rawDateFrom))
      ? new Date(rawDateFrom)
      : undefined;
    const dateTo = rawDateTo && !isNaN(Date.parse(rawDateTo))
      ? (() => { const d = new Date(rawDateTo); d.setHours(23, 59, 59, 999); return d; })()
      : undefined;
    const isManual =
      searchParams.get("isManual") !== null
        ? searchParams.get("isManual") === "true"
        : undefined;
    const accountCode = searchParams.get("accountCode") ?? undefined;
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const result = await getJournalEntries({
      dateFrom,
      dateTo,
      isManual,
      accountCode,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getEntriesForDocument } from "@/lib/modules/accounting/finance/journal";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("documents:read");
    const { id } = await params;

    const entries = await getEntriesForDocument(id);

    // Flatten into a display-friendly format
    const result = entries.map((entry) => ({
      id: entry.id,
      number: entry.number,
      date: entry.date,
      description: entry.description,
      isManual: entry.isManual,
      isReversed: entry.isReversed,
      lines: entry.lines.map((line) => ({
        id: line.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: line.debit,
        credit: line.credit,
        amountRub: line.amountRub,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

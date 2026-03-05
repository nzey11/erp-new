import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { reverseEntry } from "@/lib/modules/accounting/journal";
import { db } from "@/lib/shared/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("documents:write");
    const { id } = await params;

    const entry = await db.journalEntry.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json({ error: "Проводка не найдена" }, { status: 404 });
    }
    if (entry.isReversed) {
      return NextResponse.json({ error: "Проводка уже сторнирована" }, { status: 400 });
    }

    const reversal = await reverseEntry(id);
    return NextResponse.json(reversal);
  } catch (error) {
    return handleAuthError(error);
  }
}

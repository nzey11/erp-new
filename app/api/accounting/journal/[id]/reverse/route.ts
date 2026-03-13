import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError, roleHasPermission } from "@/lib/shared/authorization";
import {
  reverseEntry,
  CannotReverseAutoEntryError,
  RestrictedAccountPermissionError,
  isRestrictedAccountCode,
} from "@/lib/modules/accounting/finance/journal";
import { db } from "@/lib/shared/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("journal:reverse");
    const { id } = await params;

    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Проводка не найдена" }, { status: 404 });
    }
    if (entry.isReversed) {
      return NextResponse.json({ error: "Проводка уже сторнирована" }, { status: 400 });
    }

    // Check if entry has restricted accounts (60*, 62*)
    const hasRestrictedAccounts = entry.lines.some((line) =>
      isRestrictedAccountCode(line.account.code)
    );

    // Check restricted accounts permission
    if (hasRestrictedAccounts && !roleHasPermission(user.role, "journal:manualRestrictedAccounts")) {
      return NextResponse.json(
        {
          error: "Для сторнирования проводок по счетам расчётов с поставщиками и покупателями (60, 62) требуется разрешение journal:manualRestrictedAccounts",
          code: "RESTRICTED_ACCOUNT_PERMISSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const reversal = await reverseEntry(id, {
      allowRestrictedAccounts: hasRestrictedAccounts,
    });
    return NextResponse.json(reversal);
  } catch (error) {
    if (error instanceof CannotReverseAutoEntryError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "CANNOT_REVERSE_AUTO_ENTRY",
          sourceType: error.sourceType,
          sourceId: error.sourceId,
          sourceNumber: error.sourceNumber,
          hint: "Используйте отмену или корректировку документа-источника",
        },
        { status: 400 }
      );
    }
    if (error instanceof RestrictedAccountPermissionError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "RESTRICTED_ACCOUNT_PERMISSION_REQUIRED",
          accountCodes: error.accountCodes,
        },
        { status: 403 }
      );
    }
    return handleAuthError(error);
  }
}
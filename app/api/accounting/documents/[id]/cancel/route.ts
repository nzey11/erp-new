import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAuthSession } from "@/lib/shared/auth";
import {
  cancelDocumentTransactional,
  DocumentCancelError,
} from "@/lib/modules/accounting/services/document-confirm.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:confirm");
    const { id } = await params;

    // Tenant gate: ensure document belongs to the authenticated tenant
    const doc = await db.document.findUnique({ where: { id, tenantId: session.tenantId }, select: { id: true } });
    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const authSession = await getAuthSession();
    const cancelled = await cancelDocumentTransactional(id, authSession?.username ?? null);

    return NextResponse.json(cancelled);
  } catch (error) {
    if (error instanceof DocumentCancelError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

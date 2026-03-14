import { NextRequest, NextResponse } from "next/server";
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
    await requirePermission("documents:confirm");
    const { id } = await params;
    const session = await getAuthSession();

    const cancelled = await cancelDocumentTransactional(id, session?.username ?? null);

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

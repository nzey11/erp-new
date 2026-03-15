import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import {
  confirmDocumentTransactional,
  DocumentConfirmError,
} from "@/lib/modules/accounting/services/document-confirm.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:confirm");
    const { id } = await params;

    // Confirm document + write outbox event atomically
    // Worker will process the event and call handlers (balance, journal, payment)
    const document = await confirmDocumentTransactional(id, session.username ?? null);

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof DocumentConfirmError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? error.details as object : {}) },
        { status: error.statusCode }
      );
    }
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}


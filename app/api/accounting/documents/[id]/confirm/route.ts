import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import {
  confirmDocumentTransactional,
  DocumentConfirmError,
} from "@/lib/modules/accounting/services/document-confirm.service";
import { DocumentService } from "@/lib/modules/accounting";
import { processOutboxEvents } from "@/lib/events/outbox";
import { registerOutboxHandlers } from "@/lib/events/handlers/register-outbox-handlers";

// Ensure handlers are registered for immediate processing
registerOutboxHandlers();

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:confirm");
    const { id } = await params;

    // Tenant gate: ensure document belongs to the authenticated tenant
    const doc = await DocumentService.getTenantGate(id, session.tenantId);
    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Confirm document + write outbox event atomically
    // Worker will process the event and call handlers (balance, journal, payment)
    const document = await confirmDocumentTransactional(id, session.username ?? null);

    // Immediately process outbox — no need to wait for cron
    await processOutboxEvents(10);

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

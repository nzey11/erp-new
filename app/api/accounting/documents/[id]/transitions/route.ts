import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getAvailableTransitions } from "@/lib/modules/accounting/document-states";
import type { DocumentStatus, DocumentType } from "@/lib/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/accounting/documents/[id]/transitions
 *
 * Returns the list of status transitions currently available for this document.
 * Driven entirely by the state machine — no business guards, no DB stock checks.
 *
 * Response:
 *   { documentId, type, status, availableTransitions: DocumentStatus[] }
 *
 * Use this to build dynamic action buttons in the UI:
 *   - "Подтвердить" visible only when "confirmed" is in availableTransitions
 *   - "Отменить"    visible only when "cancelled" is in availableTransitions
 *   - "Отправить"   visible only when "shipped"    is in availableTransitions
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:read");
    const { id } = await params;

    const doc = await db.document.findUnique({
      where: { id },
      select: { id: true, type: true, status: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const availableTransitions = getAvailableTransitions(
      doc.type as DocumentType,
      doc.status as DocumentStatus
    );

    return NextResponse.json({
      documentId: doc.id,
      type: doc.type,
      status: doc.status,
      availableTransitions,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

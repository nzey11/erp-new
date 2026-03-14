import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getAuthSession } from "@/lib/shared/auth";
import { bulkConfirmDocuments } from "@/lib/modules/accounting/services/document-bulk-confirm.service";

/**
 * POST /api/accounting/documents/bulk-confirm
 *
 * Confirm multiple documents in bulk.
 *
 * Request body:
 *   { ids: string[] } - Array of document IDs (max 100)
 *
 * Response:
 *   { confirmed: number, skipped: number, errors: string[] }
 *
 * Semantics: Sequential Isolated
 * - Each document processed in its own transaction
 * - Failures for one document do not affect others
 * - Errors collected and returned individually
 *
 * Bulk-policy skips (not errors):
 * - Document not found
 * - inventory_count type (requires manual confirmation)
 * - Duplicate IDs (deduplicated silently)
 *
 * Domain validation errors (collected in errors[]):
 * - Invalid status transition
 * - No items
 * - Stock shortage
 */
export async function POST(request: NextRequest) {
  try {
    // Auth & permission
    await requirePermission("documents:confirm");
    const session = await getAuthSession();
    const actor = session?.username ?? null;

    // Parse & validate input
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Не указаны документы" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: "Максимум 100 документов за раз" }, { status: 400 });
    }

    // Delegate to application service
    const result = await bulkConfirmDocuments({ ids, actor });

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

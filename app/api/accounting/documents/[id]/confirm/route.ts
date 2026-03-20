import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import {
  confirmDocumentTransactional,
  DocumentConfirmError,
} from "@/lib/modules/accounting/services/document-confirm.service";
import { DocumentService } from "@/lib/modules/accounting";
import { registerOutboxHandlers } from "@/lib/events/handlers/register-outbox-handlers";
import { processOutboxEvents } from "@/lib/events";
import { rateLimit } from "@/lib/shared/rate-limit";

// Ensure handlers are registered before any outbox processing
registerOutboxHandlers();

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:confirm");

    // Rate limit: 30 requests per minute per user
    const { success: rateLimited } = rateLimit(`documents:confirm:${session.id}`, 30, 60 * 1000);
    if (!rateLimited) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429 }
      );
    }

    const { id } = await params;

    // Tenant gate: ensure document belongs to the authenticated tenant
    const doc = await DocumentService.getTenantGate(id, session.tenantId);
    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Confirm document with synchronous post-confirmation effects
    // (journal entry, balance recalculation)
    const document = await confirmDocumentTransactional(id, session.username ?? null);

    // Revalidate financial pages to reflect changes
    // Wrap in try-catch as revalidatePath doesn't work in test environment
    // TODO: Migrate to revalidateTag('journal-entries', 'balances', 'finance') once
    // all data fetching components use next: { tags: [...] } for cache tagging.
    // For now, revalidatePath is kept to avoid breaking cache invalidation.
    try {
      revalidatePath("/finance/dashboard");
      revalidatePath("/finance/payments");
      revalidatePath("/finance/reports");
      revalidatePath("/finance/balances");
      revalidatePath("/accounting/dashboard");
      revalidatePath("/accounting/reports/balances");
    } catch {
      // Ignore revalidation errors in test environment
    }

    // Process outbox events after response is sent
    // Wrap in try-catch as after() doesn't work in test environment
    try {
      after(async () => {
        try {
          await processOutboxEvents(10);
        } catch (e) {
          console.error("[OUTBOX] processOutboxEvents failed:", e);
        }
      });
    } catch {
      // In test environment, process synchronously
      await processOutboxEvents(10);
    }

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

/**
 * Bulk Document Confirmation Service
 *
 * Application orchestration layer for bulk confirm operations.
 * Coordinates iteration, deduplication, and bulk-policy skips,
 * but delegates all domain decisions to confirmDocumentTransactional().
 *
 * Responsibilities:
 * - Deduplicate input ids
 * - Fast-path skip for non-existent documents
 * - Bulk-policy skip for inventory_count (requires manual review)
 * - Call confirmDocumentTransactional() for each document
 * - Collect per-document errors
 *
 * NOT responsible for:
 * - Domain validation (status, items, stock) → confirmDocumentTransactional()
 * - State machine transitions → confirmDocumentTransactional()
 * - Stock movements, outbox events → confirmDocumentTransactional()
 */

import { db } from "@/lib/shared/db";
import {
  confirmDocumentTransactional,
  DocumentConfirmError,
} from "./document-confirm.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkConfirmInput {
  ids: string[];
  actor: string | null;
  tenantId: string;
}

export interface BulkConfirmResult {
  confirmed: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Confirm multiple documents in bulk.
 *
 * Semantics: Sequential Isolated
 * - Each document processed in its own transaction
 * - Failures for one document do not affect others
 * - Errors collected and returned individually
 *
 * Bulk-policy skips (not errors):
 * - Document not found
 * - inventory_count type (requires manual confirmation)
 *
 * Domain validation errors (collected in errors[]):
 * - Invalid status transition
 * - No items
 * - Stock shortage
 * - Any other DocumentConfirmError
 */
export async function bulkConfirmDocuments(
  input: BulkConfirmInput
): Promise<BulkConfirmResult> {
  const { ids, actor, tenantId } = input;

  // Deduplicate ids silently
  const uniqueIds = [...new Set(ids)];

  let confirmed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of uniqueIds) {
    // R1-09: tenant-scoped fast-path check
    const doc = await db.document.findFirst({
      where: { id, tenantId },
      select: { id: true, type: true },
    });

    // Skip non-existent or foreign-tenant documents (not an error in bulk mode)
    if (!doc) {
      skipped++;
      continue;
    }

    // Bulk-policy: skip inventory_count (requires manual confirmation)
    if (doc.type === "inventory_count") {
      skipped++;
      continue;
    }

    // Delegate to domain service
    try {
      await confirmDocumentTransactional(id, actor, tenantId);
      confirmed++;
    } catch (error) {
      if (error instanceof DocumentConfirmError) {
        // Collect domain validation errors with context
        errors.push(`${id}: ${error.message}`);
      } else {
        // Unknown errors
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${id}: ${message}`);
      }
      skipped++;
    }
  }

  return { confirmed, skipped, errors };
}

/**
 * Outbox Processing Cron Endpoint
 *
 * POST /api/system/outbox/process
 *
 * Processes pending outbox events. Intended to be called by external cron
 * (Vercel Cron, GitHub Actions, etc.) or manually for debugging.
 *
 * Authentication: Authorization: Bearer <OUTBOX_SECRET>
 *
 * Request body (optional):
 *   { limit?: number } - Max events to process (default: 10, max: 100)
 *
 * Response:
 *   {
 *     claimed: number,
 *     processed: number,
 *     failed: number,
 *     errors: Array<{ eventId, error }>,
 *     stats: { pending, processing, processed, failed, oldestPendingAt? }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  processOutboxEvents,
  getOutboxStats,
  registerOutboxHandler,
} from "@/lib/events/outbox";
import { logger } from "@/lib/shared/logger";

// ─── Handler Registration ─────────────────────────────────────────────────────

// Import handlers to register them
import { onDocumentConfirmedBalance } from "@/lib/modules/accounting/handlers/balance-handler";
import { onDocumentConfirmedJournal } from "@/lib/modules/accounting/handlers/journal-handler";
import { onDocumentConfirmedPayment } from "@/lib/modules/accounting/handlers/payment-handler";

// Register handlers on module load
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedBalance);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedJournal);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedPayment);

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// ─── Authentication ───────────────────────────────────────────────────────────

function validateAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return false;
  }

  // Expect "Bearer <secret>"
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return false;
  }

  const expectedSecret = process.env.OUTBOX_SECRET;

  if (!expectedSecret) {
    logger.error("outbox", "OUTBOX_SECRET not configured");
    return false;
  }

  return token === expectedSecret;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Validate authentication
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Parse request body
  let limit = DEFAULT_LIMIT;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, MAX_LIMIT);
    }
  } catch {
    // Invalid JSON, use default limit
  }

  logger.info("outbox", "Processing outbox events", { limit });

  try {
    // Process events
    const result = await processOutboxEvents(limit);

    // Get current stats
    const stats = await getOutboxStats();

    // Log result
    logger.info("outbox", "Outbox processing complete", {
      claimed: result.claimed,
      processed: result.processed,
      failed: result.failed,
      remainingPending: stats.pending,
    });

    return NextResponse.json({
      ...result,
      stats,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("outbox", "Outbox processing failed", { error: err.message });

    return NextResponse.json(
      { error: "Processing failed", details: err.message },
      { status: 500 }
    );
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * GET /api/system/outbox/process
 *
 * Returns current outbox stats without processing.
 * Useful for health monitoring.
 */
export async function GET(request: NextRequest) {
  // Validate authentication
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const stats = await getOutboxStats();

  return NextResponse.json({ stats });
}

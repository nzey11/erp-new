#!/usr/bin/env npx tsx
/**
 * Outbox Event Processor — CLI Worker
 *
 * Processes pending outbox events by calling registered handlers.
 *
 * Usage:
 *   npx tsx scripts/process-outbox.ts                    # Process up to 10 events
 *   npx tsx scripts/process-outbox.ts --limit=1          # Process 1 event (safest for pilot)
 *   npx tsx scripts/process-outbox.ts --limit=50         # Process up to 50 events
 *   npx tsx scripts/process-outbox.ts --stats            # Show stats only
 *
 * Phase 2.1 Pilot: Manual execution to validate mechanics.
 * Phase 2.2: Cron endpoint automation at /api/system/outbox/process
 */

import "dotenv/config";
import {
  processOutboxEvents,
  getOutboxStats,
  registerOutboxHandler,
  type EventHandler,
} from "@/lib/events/outbox";
import { onDocumentConfirmedBalance } from "@/lib/modules/accounting/handlers/balance-handler";
import { onDocumentConfirmedJournal } from "@/lib/modules/accounting/handlers/journal-handler";
import { onDocumentConfirmedPayment } from "@/lib/modules/accounting/handlers/payment-handler";
import { onProductCatalogUpdated } from "@/lib/modules/ecommerce/handlers";

// Register handlers
// DocumentConfirmed handlers
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedBalance as unknown as EventHandler);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedJournal as unknown as EventHandler);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedPayment as unknown as EventHandler);

// Product catalog projection handlers
registerOutboxHandler("product.updated", onProductCatalogUpdated as unknown as EventHandler);
registerOutboxHandler("sale_price.updated", onProductCatalogUpdated as unknown as EventHandler);
registerOutboxHandler("discount.updated", onProductCatalogUpdated as unknown as EventHandler);

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 10;

function parseArgs(): { limit: number; statsOnly: boolean } {
  const args = process.argv.slice(2);

  let limit = DEFAULT_LIMIT;
  let statsOnly = false;

  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      limit = parseInt(arg.split("=")[1], 10);
      if (isNaN(limit) || limit < 1) {
        console.error(`Invalid limit: ${arg}`);
        process.exit(1);
      }
    }
    if (arg === "--stats") {
      statsOnly = true;
    }
  }

  return { limit, statsOnly };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, statsOnly } = parseArgs();

  // Show stats and exit
  if (statsOnly) {
    const stats = await getOutboxStats();
    console.log("Outbox Statistics:");
    console.log(`  Pending:    ${stats.pending}`);
    console.log(`  Processing: ${stats.processing}`);
    console.log(`  Processed:  ${stats.processed}`);
    console.log(`  Failed:     ${stats.failed}`);
    console.log(`  Dead:       ${stats.dead}`);
    if (stats.oldestPendingAt) {
      console.log(`  Oldest pending: ${stats.oldestPendingAt.toISOString()}`);
    }
    return;
  }

  console.log(`Processing up to ${limit} pending events...\n`);

  // Process events using shared logic
  const result = await processOutboxEvents(limit);

  console.log("─────────────────────────────");
  console.log(`Claimed:   ${result.claimed}`);
  console.log(`Processed: ${result.processed}`);
  console.log(`Failed:    ${result.failed}`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const { eventId, error } of result.errors) {
      console.log(`  [${eventId}] ${error}`);
    }
  }

  // Show final stats
  const stats = await getOutboxStats();
  console.log(`\nRemaining pending: ${stats.pending}`);
  if (stats.dead > 0) {
    console.log(`Dead (needs attention): ${stats.dead}`);
  }
}

// Run
main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

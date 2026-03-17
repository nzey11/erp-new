/**
 * Outbox Handler Registration — Single Source of Truth
 *
 * This module wires ALL domain event handlers to the outbox handler registry.
 * It is the single authoritative place that maps event type strings to handler
 * functions, preventing duplication across route.ts / scripts / tests.
 *
 * Import and call `registerOutboxHandlers()` exactly once per process:
 *   - Production: instrumentation.ts (Next.js startup hook)
 *   - CLI scripts: scripts/process-outbox.ts
 *   - Tests: test beforeAll blocks (via clearOutboxHandlers + registerOutboxHandlers)
 *
 * DO NOT call registerOutboxHandlers() inside request handlers — that causes
 * double-registration in dev hot-reload scenarios.
 */

import {
  registerOutboxHandler,
  type EventHandler,
} from "@/lib/events/outbox";
import { onDocumentConfirmedBalance } from "@/lib/modules/accounting/handlers/balance-handler";
import { onDocumentConfirmedJournal } from "@/lib/modules/accounting/handlers/journal-handler";
import { onDocumentConfirmedPayment } from "@/lib/modules/accounting/handlers/payment-handler";
import { onProductCatalogUpdated } from "@/lib/modules/ecommerce/handlers";

// Guard: prevent double-registration (e.g. Next.js dev hot-reload)
let registered = false;

/**
 * Register all known outbox event handlers.
 * Idempotent — safe to call multiple times (subsequent calls are no-ops).
 * Use `clearOutboxHandlers()` + `registerOutboxHandlers()` in tests to reset.
 */
export function registerOutboxHandlers(): void {
  if (registered) return;
  registered = true;

  // ── DocumentConfirmed ─────────────────────────────────────────────────────
  // Three independent reactions to every document confirmation:

  // 1. Recalculate counterparty AR/AP balance
  registerOutboxHandler(
    "DocumentConfirmed",
    onDocumentConfirmedBalance as unknown as EventHandler
  );

  // 2. Auto-post double-entry journal entry
  registerOutboxHandler(
    "DocumentConfirmed",
    onDocumentConfirmedJournal as unknown as EventHandler
  );

  // 3. Auto-create Finance Payment record for shipments
  registerOutboxHandler(
    "DocumentConfirmed",
    onDocumentConfirmedPayment as unknown as EventHandler
  );

  // ── Product catalog projection ────────────────────────────────────────────
  // All three product-change event types funnel into the same handler:

  registerOutboxHandler(
    "product.updated",
    onProductCatalogUpdated as unknown as EventHandler
  );
  registerOutboxHandler(
    "sale_price.updated",
    onProductCatalogUpdated as unknown as EventHandler
  );
  registerOutboxHandler(
    "discount.updated",
    onProductCatalogUpdated as unknown as EventHandler
  );
}

/**
 * Reset the registration guard and clear the handler registry.
 * FOR TESTS ONLY — allows re-registration with a clean slate between test
 * suites that need to verify handler wiring.
 *
 * Production code must never call this.
 */
export function resetOutboxHandlerRegistration(): void {
  registered = false;
}

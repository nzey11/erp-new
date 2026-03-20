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
import { onDocumentCancelledBalance } from "@/lib/modules/accounting/handlers/cancel-balance-handler";
import { onDocumentCancelledJournal } from "@/lib/modules/accounting/handlers/cancel-journal-handler";
import { onPaymentCreated } from "@/lib/modules/accounting/handlers/payment-created-handler";
import { onPaymentDeleted } from "@/lib/modules/accounting/handlers/payment-deleted-handler";
import { onOrderPaymentConfirmed } from "@/lib/modules/accounting/handlers/order-payment-confirmed-handler";
import { onOrderCancelled } from "@/lib/modules/accounting/handlers/order-cancelled-handler";
import { onCustomerCreated } from "@/lib/modules/accounting/handlers/customer-created-handler";
import { onStockAdjusted } from "@/lib/modules/accounting/handlers/stock-adjusted-handler";
import { onCounterpartyCreated } from "@/lib/modules/accounting/handlers/counterparty-created-handler";
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

  // ── DocumentCancelled ─────────────────────────────────────────────────────
  // Two reactions to every document cancellation:

  // 1. Reverse journal entries (сторно)
  registerOutboxHandler(
    "DocumentCancelled",
    onDocumentCancelledJournal as unknown as EventHandler
  );

  // 2. Recalculate counterparty AR/AP balance
  registerOutboxHandler(
    "DocumentCancelled",
    onDocumentCancelledBalance as unknown as EventHandler
  );

  // ── Payment events ─────────────────────────────────────────────────────────
  // Finance module emits, Accounting module reacts (decoupled):

  // 1. Create journal entry when payment is created
  registerOutboxHandler(
    "PaymentCreated",
    onPaymentCreated as unknown as EventHandler
  );

  // 2. Reverse journal entry when payment is deleted
  registerOutboxHandler(
    "PaymentDeleted",
    onPaymentDeleted as unknown as EventHandler
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

  // ── Ecommerce → Accounting bridge (Phase 4) ────────────────────────────────
  // Ecommerce emits, Accounting reacts (decoupled):

  // 1. Confirm document when order payment is confirmed
  registerOutboxHandler(
    "OrderPaymentConfirmed",
    onOrderPaymentConfirmed as unknown as EventHandler
  );

  // 2. Cancel document when order is cancelled
  registerOutboxHandler(
    "OrderCancelled",
    onOrderCancelled as unknown as EventHandler
  );

  // 3. Create Counterparty when Customer is created
  registerOutboxHandler(
    "CustomerCreated",
    onCustomerCreated as unknown as EventHandler
  );

  // ── Stock and Counterparty events (Phase 5) ────────────────────────────────

  // 1. Handle stock adjustments (AVCO recalculation placeholder)
  registerOutboxHandler(
    "StockAdjusted",
    onStockAdjusted as unknown as EventHandler
  );

  // 2. Handle counterparty creation (CRM sync placeholder)
  registerOutboxHandler(
    "CounterpartyCreated",
    onCounterpartyCreated as unknown as EventHandler
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

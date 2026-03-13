/**
 * Accounting module — handler registration.
 *
 * Wires all accounting domain event handlers to the event bus.
 * Called once at app startup from lib/bootstrap/domain-events.ts.
 *
 * Each handler is responsible for a single reaction:
 *   - balance-handler: recalculates counterparty balance
 *   - journal-handler: auto-posts to double-entry journal
 *   - payment-handler: auto-creates Finance Payment record
 */

import type { IEventBus } from "@/lib/events";
import { onDocumentConfirmedBalance } from "./handlers/balance-handler";
import { onDocumentConfirmedJournal } from "./handlers/journal-handler";
import { onDocumentConfirmedPayment } from "./handlers/payment-handler";

export function registerAccountingHandlers(bus: IEventBus): void {
  bus.register("DocumentConfirmed", onDocumentConfirmedBalance);
  bus.register("DocumentConfirmed", onDocumentConfirmedJournal);
  bus.register("DocumentConfirmed", onDocumentConfirmedPayment);
}

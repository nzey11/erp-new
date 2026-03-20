/**
 * lib/events — public surface
 *
 * Import from here, not from internal files.
 */

export { eventBus, createEventBus } from "./event-bus";
export type { IEventBus, EventHandler } from "./event-bus";
export type { DomainEvent, DocumentConfirmedEvent, DocumentCancelledEvent, PaymentCreatedEvent, PaymentDeletedEvent, ProductUpdatedEvent, SalePriceUpdatedEvent, DiscountUpdatedEvent, OrderPaymentConfirmedEvent, OrderCancelledEvent, CustomerCreatedEvent, StockAdjustedEvent, CounterpartyCreatedEvent } from "./types";

// Outbox (Phase 2.1)
export {
  createOutboxEvent,
  claimOutboxEvents,
  markOutboxProcessed,
  markOutboxFailed,
  getOutboxStats,
  processOutboxEvents,
  registerOutboxHandler,
  clearOutboxHandlers,
} from "./outbox";
export type { OutboxEventRow } from "./outbox";
// Re-export EventHandler from outbox as OutboxEventHandler to avoid conflict
export type { EventHandler as OutboxEventHandler } from "./outbox";

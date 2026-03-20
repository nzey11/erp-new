/**
 * Domain Event Types
 *
 * All domain events are represented as a discriminated union on `type`.
 * TypeScript narrows the payload automatically in handlers.
 *
 * Phase 1.5 scope: DocumentConfirmed only.
 * Phase 2: Product catalog events for projection updates.
 */

import type { DocumentType } from "@/lib/generated/prisma/client";

// ─── Event shapes ──────────────────────────────────────────────────────────

export interface DocumentConfirmedEvent {
  readonly type: "DocumentConfirmed";
  readonly occurredAt: Date;
  readonly payload: {
    readonly documentId: string;
    readonly documentType: DocumentType;
    readonly documentNumber: string;
    readonly counterpartyId: string | null;
    readonly warehouseId: string | null;
    readonly totalAmount: number;
    readonly confirmedAt: Date;
    readonly confirmedBy: string | null;
    readonly tenantId: string;
  };
}

/**
 * Product catalog events for ProductCatalogProjection updates.
 * Payload contains only productId - handler reads current state from source tables.
 */
export interface ProductUpdatedEvent {
  readonly type: "product.updated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly productId: string;
  };
}

export interface SalePriceUpdatedEvent {
  readonly type: "sale_price.updated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly productId: string;
  };
}

export interface DiscountUpdatedEvent {
  readonly type: "discount.updated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly productId: string;
  };
}

/**
 * Document cancellation event.
 * Emitted when a confirmed document is cancelled.
 * Handlers: reverse journal entries, recalculate balance.
 */
export interface DocumentCancelledEvent {
  readonly type: "DocumentCancelled";
  readonly occurredAt: Date;
  readonly payload: {
    readonly documentId: string;
    readonly documentType: DocumentType;
    readonly documentNumber: string;
    readonly counterpartyId: string | null;
    readonly warehouseId: string | null;
    readonly totalAmount: number;
    readonly cancelledAt: Date;
    readonly cancelledBy: string | null;
    readonly tenantId: string;
  };
}

/**
 * Payment created event.
 * Emitted when a Finance Payment is created.
 * Handler: create journal entry for the payment.
 */
export interface PaymentCreatedEvent {
  readonly type: "PaymentCreated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly paymentId: string;
    readonly tenantId: string;
    readonly amount: number;
    readonly documentId: string | null;
    readonly counterpartyId: string | null;
    readonly type: "income" | "expense";
    readonly paymentMethod: "cash" | "bank_transfer" | "card";
    readonly categoryId: string;
    readonly date: Date;
    readonly description: string | null;
    readonly createdBy: string | null;
  };
}

/**
 * Payment deleted event.
 * Emitted when a Finance Payment is deleted.
 * Handler: reverse journal entry for the payment.
 */
export interface PaymentDeletedEvent {
  readonly type: "PaymentDeleted";
  readonly occurredAt: Date;
  readonly payload: {
    readonly paymentId: string;
    readonly tenantId: string;
    readonly amount: number;
    readonly documentId: string | null;
    readonly counterpartyId: string | null;
  };
}

/**
 * Order payment confirmed event.
 * Emitted by ecommerce module when order payment is confirmed.
 * Handler: confirm the sales_order document in accounting.
 */
export interface OrderPaymentConfirmedEvent {
  readonly type: "OrderPaymentConfirmed";
  readonly occurredAt: Date;
  readonly payload: {
    readonly orderId: string;
    readonly tenantId: string;
    readonly documentId: string;
    readonly customerId: string;
    readonly amount: number;
    readonly paymentMethod: string;
    readonly paymentExternalId?: string;
    readonly actor: string | null;
  };
}

/**
 * Order cancelled event.
 * Emitted by ecommerce module when order is cancelled.
 * Handler: cancel the sales_order document in accounting.
 */
export interface OrderCancelledEvent {
  readonly type: "OrderCancelled";
  readonly occurredAt: Date;
  readonly payload: {
    readonly orderId: string;
    readonly tenantId: string;
    readonly documentId: string;
    readonly customerId: string;
    readonly actor: string | null;
  };
}

/**
 * Customer created event.
 * Emitted by ecommerce module when a new customer is created.
 * Handler: create Counterparty linked to Customer.
 */
export interface CustomerCreatedEvent {
  readonly type: "CustomerCreated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly customerId: string;
    readonly tenantId: string;
    readonly email: string | null;
    readonly name: string | null;
    readonly phone: string | null;
    readonly telegramId: string | null;
    readonly telegramUsername: string | null;
  };
}

/**
 * Stock adjusted event.
 * Emitted when stock is manually adjusted or reconciled.
 * Handler: trigger AVCO recalculation if needed.
 */
export interface StockAdjustedEvent {
  readonly type: "StockAdjusted";
  readonly occurredAt: Date;
  readonly payload: {
    readonly stockRecordId: string;
    readonly tenantId: string;
    readonly productId: string;
    readonly warehouseId: string;
    readonly quantityDelta: number;
    readonly adjustmentType: "manual" | "reconciliation" | "correction";
  };
}

/**
 * Counterparty created event.
 * Emitted when a new counterparty is created in accounting.
 * Handler: sync party data in CRM if needed.
 */
export interface CounterpartyCreatedEvent {
  readonly type: "CounterpartyCreated";
  readonly occurredAt: Date;
  readonly payload: {
    readonly counterpartyId: string;
    readonly tenantId: string;
    readonly customerId: string | null;
    readonly name: string;
    readonly type: "customer" | "supplier";
  };
}

// ─── Union — grows here, nowhere else ──────────────────────────────────────

export type DomainEvent =
  | DocumentConfirmedEvent
  | DocumentCancelledEvent
  | PaymentCreatedEvent
  | PaymentDeletedEvent
  | ProductUpdatedEvent
  | SalePriceUpdatedEvent
  | DiscountUpdatedEvent
  | OrderPaymentConfirmedEvent
  | OrderCancelledEvent
  | CustomerCreatedEvent
  | StockAdjustedEvent
  | CounterpartyCreatedEvent;

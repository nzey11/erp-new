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

// ─── Union — grows here, nowhere else ──────────────────────────────────────

export type DomainEvent =
  | DocumentConfirmedEvent
  | ProductUpdatedEvent
  | SalePriceUpdatedEvent
  | DiscountUpdatedEvent;
  // | DocumentCancelledEvent   (Phase 1.5+)
  // | StockMovementCreatedEvent (Phase 1.5+)

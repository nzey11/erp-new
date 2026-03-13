/**
 * Domain Event Types
 *
 * All domain events are represented as a discriminated union on `type`.
 * TypeScript narrows the payload automatically in handlers.
 *
 * Phase 1.5 scope: DocumentConfirmed only.
 * Future phases: DocumentCancelled, StockMovementCreated, ...
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
  };
}

// ─── Union — grows here, nowhere else ──────────────────────────────────────

export type DomainEvent =
  | DocumentConfirmedEvent;
  // | DocumentCancelledEvent   (Phase 1.5+)
  // | StockMovementCreatedEvent (Phase 1.5+)

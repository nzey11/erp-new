/**
 * Document State Machine
 *
 * Single source of truth for all document status transition rules.
 *
 * Design principles:
 * - Pure functions, zero DB access, zero side effects
 * - Structural rules only: "can type X go from status A to status B?"
 * - Business guards (has items? stock available?) stay in services
 * - DocumentStateError carries full context for route/UI/logs
 *
 * Future: when Phase 1.4 splits modules by domain,
 * this file splits mechanically into sales-states, inventory-states, etc.
 */

import type { DocumentType, DocumentStatus } from "@/lib/generated/prisma/client";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class DocumentStateError extends Error {
  constructor(
    public readonly documentType: DocumentType,
    public readonly fromStatus: DocumentStatus,
    public readonly toStatus: DocumentStatus,
    public readonly reason: string
  ) {
    super(
      `Cannot transition ${documentType} from '${fromStatus}' to '${toStatus}': ${reason}`
    );
    this.name = "DocumentStateError";
  }
}

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------
// Each entry: for a given DocumentType, maps current status → allowed next statuses.
// A status not present as a key means "no outgoing transitions allowed".
// ---------------------------------------------------------------------------

type TransitionMap = Partial<Record<DocumentStatus, DocumentStatus[]>>;

const TRANSITIONS: Record<DocumentType, TransitionMap> = {
  // ── Stock operations ──────────────────────────────────────────────────────
  stock_receipt: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  write_off: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  stock_transfer: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  inventory_count: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },

  // ── Purchases ─────────────────────────────────────────────────────────────
  purchase_order: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  incoming_shipment: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  supplier_return: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  // sales_order and outgoing_shipment have an extended lifecycle: shipped → delivered
  sales_order: {
    draft:     ["confirmed"],
    confirmed: ["shipped", "cancelled"],
    shipped:   ["delivered", "cancelled"],
  },
  outgoing_shipment: {
    draft:     ["confirmed"],
    confirmed: ["shipped", "cancelled"],
    shipped:   ["delivered"],
  },
  customer_return: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  incoming_payment: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
  outgoing_payment: {
    draft:     ["confirmed"],
    confirmed: ["cancelled"],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the transition (from → to) is allowed for the given type.
 * Pure function — use for conditional UI rendering or pre-checks.
 */
export function canTransition(
  type: DocumentType,
  from: DocumentStatus,
  to: DocumentStatus
): boolean {
  const allowed = TRANSITIONS[type]?.[from];
  return allowed?.includes(to) ?? false;
}

/**
 * Asserts the transition is allowed.
 * Throws DocumentStateError with full context if not.
 * Use at the entry point of every status-changing operation.
 */
export function validateTransition(
  type: DocumentType,
  from: DocumentStatus,
  to: DocumentStatus
): void {
  if (!canTransition(type, from, to)) {
    const allowed = TRANSITIONS[type]?.[from] ?? [];
    const reason =
      allowed.length > 0
        ? `allowed next statuses are: [${allowed.join(", ")}]`
        : `no transitions are allowed from '${from}'`;

    throw new DocumentStateError(type, from, to, reason);
  }
}

/**
 * Returns the list of statuses reachable from the current status for the given type.
 * Returns an empty array when no transitions are possible (terminal state).
 * Useful for building dynamic action buttons in the UI.
 */
export function getAvailableTransitions(
  type: DocumentType,
  status: DocumentStatus
): DocumentStatus[] {
  return TRANSITIONS[type]?.[status] ?? [];
}

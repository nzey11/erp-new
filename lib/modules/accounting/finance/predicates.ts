/**
 * Finance domain — document type predicates
 *
 * Owner: finance domain
 * These rules belong to the finance domain because it is finance
 * that decides which document types affect counterparty balances
 * and which document types represent monetary payments.
 *
 * Phase 1.4: extracted from lib/modules/accounting/documents.ts
 * The old file re-exports these for backward compatibility.
 */

import type { DocumentType } from "@/lib/generated/prisma/client";

/**
 * Document types that affect counterparty balance.
 *
 * Shipments/returns create or settle trade payables/receivables.
 * Payments directly settle the monetary obligation.
 */
export const BALANCE_AFFECTING_TYPES: DocumentType[] = [
  "incoming_shipment",
  "outgoing_shipment",
  "supplier_return",
  "customer_return",
  "incoming_payment",
  "outgoing_payment",
];

/** Does confirming this document type affect a counterparty's balance? */
export function affectsBalance(type: DocumentType): boolean {
  return BALANCE_AFFECTING_TYPES.includes(type);
}

/** Is this document type a monetary payment (not a goods movement)? */
export function isPaymentType(type: DocumentType): boolean {
  return type === "incoming_payment" || type === "outgoing_payment";
}

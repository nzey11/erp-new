/**
 * Inventory domain — document type predicates
 *
 * Owner: inventory domain
 * These rules belong to the inventory domain because it is inventory
 * that decides which document types affect stock levels.
 *
 * Phase 1.4: extracted from lib/modules/accounting/documents.ts
 * The old file re-exports these for backward compatibility.
 */

import type { DocumentType } from "@/lib/generated/prisma/client";

/** Document types that increase stock quantity */
export const STOCK_INCREASE_TYPES: DocumentType[] = [
  "stock_receipt",
  "incoming_shipment",
  "customer_return",
];

/** Document types that decrease stock quantity */
export const STOCK_DECREASE_TYPES: DocumentType[] = [
  "write_off",
  "outgoing_shipment",
  "supplier_return",
];

/**
 * Does confirming this document type affect warehouse stock levels?
 *
 * Note: inventory_count does NOT directly affect stock —
 * it creates linked write_off / stock_receipt documents instead.
 */
export function affectsStock(type: DocumentType): boolean {
  return (
    STOCK_INCREASE_TYPES.includes(type) ||
    STOCK_DECREASE_TYPES.includes(type) ||
    type === "stock_transfer"
  );
}

/** Does this document type increase stock? */
export function isStockIncrease(type: DocumentType): boolean {
  return STOCK_INCREASE_TYPES.includes(type);
}

/** Does this document type decrease stock? */
export function isStockDecrease(type: DocumentType): boolean {
  return STOCK_DECREASE_TYPES.includes(type);
}

/** Is this document type an inventory count? */
export function isInventoryCount(type: DocumentType): boolean {
  return type === "inventory_count";
}

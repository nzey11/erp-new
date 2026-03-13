/**
 * Kernel vocabulary for document types and statuses.
 *
 * This file is a BACKWARD-COMPATIBLE SHIM (Phase 1.4).
 * Domain predicates have been extracted to their owner modules:
 *
 *   inventory predicates → lib/modules/accounting/inventory/predicates.ts
 *   finance predicates   → lib/modules/accounting/finance/predicates.ts
 *
 * All existing imports from this file continue to work unchanged.
 * New code should import directly from the domain module.
 */

import { db } from "@/lib/shared/db";
import type { DocumentType, DocumentStatus } from "@/lib/generated/prisma/client";

// ── Re-exports from domain modules ────────────────────────────────────────────

export {
  STOCK_INCREASE_TYPES,
  STOCK_DECREASE_TYPES,
  affectsStock,
  isStockIncrease,
  isStockDecrease,
  isInventoryCount,
} from "@/lib/modules/accounting/inventory/predicates";

export {
  BALANCE_AFFECTING_TYPES,
  affectsBalance,
  isPaymentType,
} from "@/lib/modules/accounting/finance/predicates";

// ── Kernel vocabulary (stays here) ────────────────────────────────────────────

/** Document type prefixes for auto-numbering */
const DOC_TYPE_PREFIX: Record<DocumentType, string> = {
  stock_receipt: "ОП",
  write_off: "СП",
  stock_transfer: "ПМ",
  inventory_count: "ИН",
  purchase_order: "ЗП",
  incoming_shipment: "ПР",
  supplier_return: "ВП",
  sales_order: "ЗК",
  outgoing_shipment: "ОТ",
  customer_return: "ВК",
  incoming_payment: "ВхП",
  outgoing_payment: "ИсП",
};

/** Russian names for document types */
const DOC_TYPE_NAME: Record<DocumentType, string> = {
  stock_receipt: "Оприходование",
  write_off: "Списание",
  stock_transfer: "Перемещение",
  inventory_count: "Инвентаризация",
  purchase_order: "Заказ поставщику",
  incoming_shipment: "Приёмка",
  supplier_return: "Возврат поставщику",
  sales_order: "Заказ покупателя",
  outgoing_shipment: "Отгрузка",
  customer_return: "Возврат покупателя",
  incoming_payment: "Входящий платёж",
  outgoing_payment: "Исходящий платёж",
};

/** Russian names for document statuses */
const DOC_STATUS_NAME: Record<DocumentStatus, string> = {
  draft: "Черновик",
  confirmed: "Подтверждён",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

/** Generate document number: ПР-00001 */
export async function generateDocumentNumber(type: DocumentType): Promise<string> {
  const prefix = DOC_TYPE_PREFIX[type];
  const counter = await db.documentCounter.upsert({
    where: { prefix },
    update: { lastNumber: { increment: 1 } },
    create: { prefix, lastNumber: 1 },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(5, "0")}`;
}

/** Get Russian name for document type */
export function getDocTypeName(type: DocumentType): string {
  return DOC_TYPE_NAME[type] ?? type;
}

/** Get Russian name for document status */
export function getDocStatusName(status: DocumentStatus): string {
  return DOC_STATUS_NAME[status] ?? status;
}

/** Get prefix for document type */
export function getDocTypePrefix(type: DocumentType): string {
  return DOC_TYPE_PREFIX[type];
}

/** Does document type require a warehouse? */
export function requiresWarehouse(type: DocumentType): boolean {
  return type !== "incoming_payment" && type !== "outgoing_payment";
}

/**
 * Does document type require a counterparty?
 * Structural constraint — stays in kernel.
 */
export function requiresCounterparty(type: DocumentType): boolean {
  return [
    "purchase_order", "incoming_shipment", "supplier_return",
    "sales_order", "outgoing_shipment", "customer_return",
    "incoming_payment", "outgoing_payment",
  ].includes(type);
}

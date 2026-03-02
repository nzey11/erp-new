import { db } from "@/lib/shared/db";
import type { DocumentType, DocumentStatus } from "@/lib/generated/prisma/client";

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
  cancelled: "Отменён",
};

/** Document types that increase stock */
export const STOCK_INCREASE_TYPES: DocumentType[] = [
  "stock_receipt",
  "incoming_shipment",
  "customer_return",
];

/** Document types that decrease stock */
export const STOCK_DECREASE_TYPES: DocumentType[] = [
  "write_off",
  "outgoing_shipment",
  "supplier_return",
];

/** Document types that affect counterparty balance */
export const BALANCE_AFFECTING_TYPES: DocumentType[] = [
  "incoming_shipment",
  "outgoing_shipment",
  "supplier_return",
  "customer_return",
  "incoming_payment",
  "outgoing_payment",
];

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

/** Does document type affect stock? */
export function affectsStock(type: DocumentType): boolean {
  return (
    STOCK_INCREASE_TYPES.includes(type) ||
    STOCK_DECREASE_TYPES.includes(type) ||
    type === "stock_transfer"
  );
  // inventory_count does NOT directly affect stock —
  // it creates linked write_off / stock_receipt documents instead
}

/** Is document type an inventory count? */
export function isInventoryCount(type: DocumentType): boolean {
  return type === "inventory_count";
}

/** Does document type affect counterparty balance? */
export function affectsBalance(type: DocumentType): boolean {
  return BALANCE_AFFECTING_TYPES.includes(type);
}

/** Does document type increase stock? */
export function isStockIncrease(type: DocumentType): boolean {
  return STOCK_INCREASE_TYPES.includes(type);
}

/** Does document type decrease stock? */
export function isStockDecrease(type: DocumentType): boolean {
  return STOCK_DECREASE_TYPES.includes(type);
}

/** Get prefix for document type */
export function getDocTypePrefix(type: DocumentType): string {
  return DOC_TYPE_PREFIX[type];
}

/** Does document type require a warehouse? */
export function requiresWarehouse(type: DocumentType): boolean {
  return type !== "incoming_payment" && type !== "outgoing_payment";
}

/** Does document type require a counterparty? */
export function requiresCounterparty(type: DocumentType): boolean {
  return [
    "purchase_order", "incoming_shipment", "supplier_return",
    "sales_order", "outgoing_shipment", "customer_return",
    "incoming_payment", "outgoing_payment",
  ].includes(type);
}

/** Is document type a payment? */
export function isPaymentType(type: DocumentType): boolean {
  return type === "incoming_payment" || type === "outgoing_payment";
}

/**
 * Document type options — shared constants for document creation dialogs.
 * Extracted from legacy DocumentsTable during Wave 3 migration.
 */

export const DOC_TYPE_OPTIONS = [
  { value: "stock_receipt", label: "Оприходование", group: "stock" },
  { value: "write_off", label: "Списание", group: "stock" },
  { value: "stock_transfer", label: "Перемещение", group: "stock" },
  { value: "inventory_count", label: "Инвентаризация", group: "stock" },
  { value: "purchase_order", label: "Заказ поставщику", group: "purchases" },
  { value: "incoming_shipment", label: "Приёмка", group: "purchases" },
  { value: "supplier_return", label: "Возврат поставщику", group: "purchases" },
  { value: "sales_order", label: "Заказ покупателя", group: "sales" },
  { value: "outgoing_shipment", label: "Отгрузка", group: "sales" },
  { value: "customer_return", label: "Возврат покупателя", group: "sales" },
  { value: "incoming_payment", label: "Входящий платёж", group: "finance" },
  { value: "outgoing_payment", label: "Исходящий платёж", group: "finance" },
];

"use client";

import { ShoppingCart, User } from "lucide-react";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { createDateColumn } from "@/components/erp/columns";
import { createMoneyColumn } from "@/components/erp/columns";
import { createDocumentNumberColumn } from "@/components/erp/document/document-number-column";
import { createStatusColumn } from "@/components/erp/columns";
import type { SalesOrderRow, EcomStatus, PaymentStatus, DeliveryType } from "@/lib/domain/sales-orders/queries";

/**
 * Ecom status map with Russian labels and Tailwind color classes.
 * Separate from DocumentStatusMap — ecom has its own workflow states.
 */
export const EcomStatusMap: Record<EcomStatus, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  paid: { label: "Оплачен", color: "bg-blue-100 text-blue-800 border-blue-300" },
  processing: { label: "В работе", color: "bg-orange-100 text-orange-800 border-orange-300" },
  shipped: { label: "Отправлен", color: "bg-purple-100 text-purple-800 border-purple-300" },
  delivered: { label: "Доставлен", color: "bg-green-100 text-green-800 border-green-300" },
  cancelled: { label: "Отменён", color: "bg-red-100 text-red-800 border-red-300" },
};

/**
 * Payment status map with Russian labels and Tailwind color classes.
 */
const PaymentStatusMap: Record<PaymentStatus, { label: string; color: string }> = {
  pending: { label: "Ожидает оплаты", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  paid: { label: "Оплачен", color: "bg-green-100 text-green-800 border-green-300" },
  failed: { label: "Ошибка оплаты", color: "bg-red-100 text-red-800 border-red-300" },
  refunded: { label: "Возврат", color: "bg-gray-100 text-gray-700 border-gray-300" },
};

/**
 * Delivery type labels in Russian.
 */
const DeliveryTypeLabels: Record<DeliveryType, string> = {
  pickup: "Самовывоз",
  courier: "Курьер",
};

/**
 * Get customer display string based on available info.
 * Priority: name → phone → @telegramUsername → "Покупатель" → counterparty.name → "—"
 */
function getCustomerDisplay(row: SalesOrderRow): string {
  if (row.customerId && row.customer) {
    if (row.customer.name) return row.customer.name;
    if (row.customer.phone) return row.customer.phone;
    if (row.customer.telegramUsername) return `@${row.customer.telegramUsername}`;
    return "Покупатель";
  }
  return row.counterparty?.name ?? "—";
}

/**
 * Column definitions for the sales orders (sales_order tab) list.
 * Uses ERPTable primitives with Ecom-specific status maps.
 */
export function getSalesOrderColumns(): ERPColumn<SalesOrderRow>[] {
  return [
    // 1. Document number with link
    createDocumentNumberColumn<SalesOrderRow>({ width: 130 }),

    // 2. Date column
    createDateColumn<SalesOrderRow>({
      key: "date",
      title: "Дата",
      accessor: (row) => row.date,
      width: 110,
      sortable: true,
    }),

    // 3. Source badge (ecom / manual)
    {
      key: "source",
      title: "Источник",
      width: 140,
      render: (_value, row) => {
        const isEcom = row.customerId != null;
        return isEcom ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
            <ShoppingCart className="h-3 w-3" />
            Интернет-магазин
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5">
            <User className="h-3 w-3" />
            Менеджер
          </span>
        );
      },
    },

    // 4. Customer display
    {
      key: "customer",
      title: "Покупатель",
      width: 180,
      render: (_value, row) => (
        <span className="text-sm">{getCustomerDisplay(row)}</span>
      ),
    },

    // 5. Payment status badge
    createStatusColumn<SalesOrderRow>({
      key: "paymentStatus",
      title: "Оплата",
      accessor: (row) => row.paymentStatus,
      statusMap: PaymentStatusMap,
      width: 150,
      sortable: false,
    }),

    // 6. Delivery type
    {
      key: "deliveryType",
      title: "Доставка",
      width: 120,
      render: (_value, row) => {
        const dt = row.deliveryType;
        if (!dt) return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-sm">{DeliveryTypeLabels[dt]}</span>;
      },
    },

    // 7. Total amount
    createMoneyColumn<SalesOrderRow>({
      key: "totalAmount",
      title: "Сумма",
      accessor: (row) => row.totalAmount,
      width: 130,
      sortable: true,
    }),

    // 8. Ecom status badge
    {
      key: "status",
      title: "Статус",
      width: 150,
      sortable: true,
      render: (_value, row) => {
        const status = row.status;
        const config = EcomStatusMap[status];
        if (!config) return <span className="text-xs">{status}</span>;
        return (
          <span
            className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${config.color}`}
          >
            {config.label}
          </span>
        );
      },
    },
  ];
}

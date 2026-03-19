"use client";

/**
 * SalesOrdersView — extracted from legacy sales/page.tsx.
 * Preserved as-is for Step 4b migration (EcomStatus, paymentStatus, dual mutations).
 *
 * Step 4b will replace this with an ERPTable-based implementation.
 */

import { useState, useEffect } from "react";
import { csrfFetch } from "@/lib/client/csrf";
import { Button, Select } from "antd";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { ShoppingCart, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRub, formatDate } from "@/lib/shared/utils";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import Link from "next/link";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type DeliveryType = "pickup" | "courier";
type EcomStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

interface SalesOrderDoc {
  id: string;
  number: string;
  type: string;
  status: string;
  statusName: string;
  date: string;
  totalAmount: number;
  customerId: string | null;
  paymentStatus: PaymentStatus | null;
  deliveryType: DeliveryType | null;
  notes: string | null;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    telegramUsername: string | null;
  } | null;
  counterparty: { id: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  _count: { items: number };
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  failed: "Ошибка оплаты",
  refunded: "Возврат",
};

const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  refunded: "bg-gray-100 text-gray-700 border-gray-300",
};

const ECOM_STATUS_COLOR: Record<EcomStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-blue-100 text-blue-800 border-blue-300",
  processing: "bg-orange-100 text-orange-800 border-orange-300",
  shipped: "bg-purple-100 text-purple-800 border-purple-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const DELIVERY_LABEL: Record<DeliveryType, string> = {
  pickup: "Самовывоз",
  courier: "Курьер",
};

function getCustomerDisplay(doc: SalesOrderDoc): string {
  if (doc.customerId && doc.customer) {
    if (doc.customer.name) return doc.customer.name;
    if (doc.customer.phone) return doc.customer.phone;
    if (doc.customer.telegramUsername) return `@${doc.customer.telegramUsername}`;
    return "Покупатель";
  }
  return doc.counterparty?.name ?? "—";
}

export function SalesOrdersView({ onRefresh }: { onRefresh?: () => void }) {
  const grid = useDataGrid<SalesOrderDoc>({
    endpoint: "/api/accounting/documents",
    pageSize: 25,
    enablePagination: true,
    enableSearch: true,
    sortable: true,
    defaultSort: { field: "date", order: "desc" },
    enablePageSizeChange: true,
    pageSizeOptions: [10, 25, 50, 100],
    defaultFilters: { type: "sales_order", status: "", source: "" },
    filterToParam: (key, value) => {
      if (key === "source") return null;
      if (!value) return null;
      return value;
    },
  });

  const [sourceFilter, setSourceFilter] = useState<"all" | "ecom" | "manual">(
    "all"
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const allRows = grid.gridProps.data ?? [];
  const rows =
    sourceFilter === "all"
      ? allRows
      : sourceFilter === "ecom"
      ? allRows.filter((d) => d.customerId != null)
      : allRows.filter((d) => d.customerId == null);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await csrfFetch(
        `/api/accounting/ecommerce/orders/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Статус обновлён");
      grid.mutate.refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      const res = await csrfFetch(
        `/api/accounting/documents/${id}/confirm`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Документ подтверждён");
      grid.mutate.refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const columns: DataGridColumn<SalesOrderDoc>[] = [
    {
      accessorKey: "number",
      header: "Номер",
      size: 130,
      enableSorting: true,
      meta: { canHide: false },
      cell: ({ row }) => (
        <span className="font-mono font-medium">{row.original.number}</span>
      ),
    },
    {
      accessorKey: "date",
      header: "Дата",
      size: 110,
      enableSorting: true,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      id: "source",
      header: "Источник",
      size: 140,
      cell: ({ row }) => {
        const isEcom = row.original.customerId != null;
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
    {
      id: "customer",
      header: "Покупатель",
      size: 180,
      cell: ({ row }) => (
        <span className="text-sm">{getCustomerDisplay(row.original)}</span>
      ),
    },
    {
      id: "paymentStatus",
      header: "Оплата",
      size: 150,
      cell: ({ row }) => {
        const ps = row.original.paymentStatus;
        if (!ps)
          return (
            <span className="text-muted-foreground text-xs">—</span>
          );
        return (
          <span
            className={cn(
              "inline-block text-xs font-medium border rounded-full px-2.5 py-0.5",
              PAYMENT_STATUS_COLOR[ps]
            )}
          >
            {PAYMENT_STATUS_LABEL[ps]}
          </span>
        );
      },
    },
    {
      id: "delivery",
      header: "Доставка",
      size: 120,
      cell: ({ row }) => {
        const dt = row.original.deliveryType;
        if (!dt)
          return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-sm">{DELIVERY_LABEL[dt]}</span>;
      },
    },
    {
      accessorKey: "totalAmount",
      header: "Сумма",
      size: 130,
      enableSorting: true,
      meta: { align: "right" as const },
      cell: ({ row }) => formatRub(row.original.totalAmount),
    },
    {
      accessorKey: "statusName",
      header: "Статус",
      size: 150,
      cell: ({ row }) => {
        const s = row.original.status as EcomStatus;
        return (
          <span
            className={cn(
              "inline-block text-xs font-medium border rounded-full px-2.5 py-0.5",
              ECOM_STATUS_COLOR[s] ?? "bg-gray-100 text-gray-700 border-gray-300"
            )}
          >
            {row.original.statusName}
          </span>
        );
      },
    },
    {
      id: "actions",
      size: 130,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => {
        const doc = row.original;
        const isEcom = doc.customerId != null;
        return (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={`/documents/${doc.id}`}>
              <Button type="text" icon={<Eye className="h-4 w-4" />} title="Просмотр" />
            </Link>
            {isEcom && doc.status === "paid" && (
              <Button
                size="small"
                variant="outlined"
                className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "processing")}
              >
                В работу
              </Button>
            )}
            {isEcom && doc.status === "processing" && (
              <Button
                size="small"
                variant="outlined"
                className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "shipped")}
              >
                Отправить
              </Button>
            )}
            {isEcom && doc.status === "shipped" && (
              <Button
                size="small"
                variant="outlined"
                className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "delivered")}
              >
                Доставлен
              </Button>
            )}
            {!isEcom && doc.status === "draft" && (
              <Button
                type="text"
                icon={<span className="text-green-600 text-xs font-bold">✓</span>}
                title="Подтвердить"
                onClick={() => handleConfirm(doc.id)}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataGrid
      {...grid.gridProps}
      data={rows}
      columns={columns}
      emptyMessage="Заказы покупателей не найдены"
      persistenceKey="sales-orders-ecom"
      toolbar={{
        ...grid.gridProps.toolbar,
        search: {
          value: grid.search,
          onChange: grid.setSearch,
          placeholder: "Поиск по номеру...",
        },
        filters: mounted ? (
          <Select
            value={sourceFilter}
            onChange={(v) => setSourceFilter(v as typeof sourceFilter)}
            style={{ width: 176 }}
            options={[
              { value: "all", label: "Все заказы" },
              { value: "ecom", label: "🛒 Интернет-магазин" },
              { value: "manual", label: "👤 Менеджер" },
            ]}
          />
        ) : null,
      }}
    />
  );
}

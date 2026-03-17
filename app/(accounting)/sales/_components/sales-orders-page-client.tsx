"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Dropdown, Button } from "antd";
import { MoreOutlined } from "@ant-design/icons";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import type { SalesOrderFilters } from "@/lib/domain/sales-orders/parse-filters";
import type { GetSalesOrdersResult, SalesOrderRow } from "@/lib/domain/sales-orders/queries";
import { SalesOrdersFilterBar } from "./sales-orders-filter-bar";
import { getSalesOrderColumns } from "./sales-orders-columns";
import { getSalesOrderRowActions, type EcomActionType } from "./sales-orders-row-actions";
import { csrfFetch } from "@/lib/client/csrf";

interface SalesOrdersPageClientProps {
  /** Server-fetched data for the sales_order tab */
  initialData: GetSalesOrdersResult;
  initialFilters: SalesOrderFilters;
}

/**
 * Sales orders page client shell — ERPTable-based implementation.
 * Replaces legacy SalesOrdersView (DataGrid-based).
 *
 * Architecture:
 * - Server-fetched data via getSalesOrders() → ERPTable
 * - URL-driven filters via SalesOrdersFilterBar
 * - Row actions: open (navigate), update-status (ecom workflow), confirm (manual)
 */
export function SalesOrdersPageClient({
  initialData,
  initialFilters,
}: SalesOrdersPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Selection state for bulk operations
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Mounted guard — prevents antd pagination Select hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Server data — never frozen in useState
  const data = initialData;

  // ─── Row actions ─────────────────────────────────────────────────────────────

  const handleRowAction = async (
    type: EcomActionType,
    row: SalesOrderRow,
    payload?: { status: string }
  ) => {
    if (type === "update-status") {
      // Navigation (open) when no payload
      if (!payload) {
        router.push(`/documents/${row.id}`);
        return;
      }

      // Update ecom order status
      try {
        const res = await csrfFetch(
          `/api/accounting/ecommerce/orders/${row.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: payload.status }),
          }
        );
        if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
        message.success("Статус обновлён");
        router.refresh();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Ошибка");
      }
      return;
    }

    if (type === "confirm") {
      // Confirm manual document
      try {
        const res = await csrfFetch(
          `/api/accounting/documents/${row.id}/confirm`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
        message.success("Документ подтверждён");
        router.refresh();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Ошибка");
      }
      return;
    }
  };

  // ─── Table props ─────────────────────────────────────────────────────────────

  const selection: ERPSelection<SalesOrderRow> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };

  const columns = getSalesOrderColumns();

  const handleSortChange = ({ sortField, sortOrder }: { sortField?: string; sortOrder?: "ascend" | "descend" | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortField) {
      params.set("sort", sortField);
      params.set("order", sortOrder === "ascend" ? "asc" : "desc");
    } else {
      params.delete("sort");
      params.delete("order");
    }
    params.set("page", "1");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const rowActions = (row: SalesOrderRow) => {
    const items = getSalesOrderRowActions(row, handleRowAction);
    return (
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button type="text" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <SalesOrdersFilterBar initialFilters={initialFilters} />

      <ERPToolbar selectedCount={selectedRowKeys.length} />

      {/* Table — rendered only after mount to avoid antd pagination Select hydration mismatch */}
      {mounted && (
        <ERPTable<SalesOrderRow>
          data={data.items}
          columns={columns}
          pagination={pagination}
          selection={selection}
          rowActions={rowActions}
          rowKey="id"
          sticky
          emptyText="Заказы покупателей не найдены"
          onChange={({ sortField, sortOrder }) => handleSortChange({ sortField, sortOrder })}
        />
      )}
    </div>
  );
}

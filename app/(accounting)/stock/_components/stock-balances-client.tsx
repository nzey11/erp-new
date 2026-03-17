"use client";

import { useState, useMemo, useCallback } from "react";
import { Button, Space } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import type { StockFilters } from "@/lib/domain/stock/parse-filters";
import type {
  GetStockBalancesResult,
  StockBalanceRow,
} from "@/lib/domain/stock/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { StockFilterBar } from "./stock-filter-bar";
import { getStockBalanceColumns } from "./stock-table-columns";
import { formatRub, formatNumber } from "@/lib/shared/utils";

interface Warehouse {
  id: string;
  name: string;
}

interface StockBalancesClientProps {
  initialData: GetStockBalancesResult;
  initialFilters: StockFilters;
  warehouses: Warehouse[];
}

/**
 * Stock balances client shell — Balances tab only.
 *
 * Responsibilities:
 * - Render ERPTable with stock balance columns
 * - Render StockFilterBar (URL-driven)
 * - Render ERPToolbar with CSV export (no create — read-only)
 * - Compute and display totals footer row
 *
 * No row actions — stock balances are read-only.
 * No Drawer — there is nothing to edit here.
 */
export function StockBalancesClient({
  initialData,
  initialFilters,
  warehouses,
}: StockBalancesClientProps) {
  // Selection state (rows can be selected for potential future bulk ops)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  const columns = getStockBalanceColumns();

  const pagination: ERPPagination = {
    current: initialData.page,
    pageSize: initialData.pageSize,
    total: initialData.total,
  };

  const selection: ERPSelection<StockBalanceRow> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  // Compute totals from visible page data
  const totals = useMemo(() => {
    if (initialData.items.length === 0) return null;
    return {
      quantity: initialData.items.reduce((s, r) => s + r.quantity, 0),
      reserve: initialData.items.reduce((s, r) => s + r.reserve, 0),
      available: initialData.items.reduce((s, r) => s + r.available, 0),
      costValue: initialData.items.reduce((s, r) => s + (r.costValue ?? 0), 0),
      saleValue: initialData.items.reduce((s, r) => s + (r.saleValue ?? 0), 0),
    };
  }, [initialData.items]);

  // CSV export — calls existing export endpoint with current filters
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (initialFilters.warehouseId) {
        params.set("warehouseId", initialFilters.warehouseId);
      }
      if (initialFilters.search) {
        params.set("search", initialFilters.search);
      }

      const res = await fetch(`/api/accounting/stock/export?${params}`);
      if (!res.ok) throw new Error("Ошибка экспорта");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stock_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Экспорт завершён");
    } catch {
      toast.error("Ошибка экспорта");
    } finally {
      setExportLoading(false);
    }
  }, [initialFilters.warehouseId, initialFilters.search]);

  const exportButton = (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleExport}
      loading={exportLoading}
    >
      CSV
    </Button>
  );

  // Summary footer rendered below the table
  const summaryFooter = totals ? (
    <div className="mt-2 rounded-lg border bg-muted/40 px-4 py-2">
      <Space size="large" wrap>
        <span className="text-sm text-muted-foreground">
          Итого по странице:
        </span>
        <span className="text-sm">
          Кол-во:{" "}
          <strong className="font-mono">{formatNumber(totals.quantity)}</strong>
        </span>
        <span className="text-sm">
          Резерв:{" "}
          <strong className="font-mono text-amber-600">
            {formatNumber(totals.reserve)}
          </strong>
        </span>
        <span className="text-sm">
          Доступно:{" "}
          <strong
            className={
              totals.available < 0
                ? "font-mono text-red-600"
                : "font-mono"
            }
          >
            {formatNumber(totals.available)}
          </strong>
        </span>
        <span className="text-sm">
          Себестоимость:{" "}
          <strong className="font-mono">{formatRub(totals.costValue)}</strong>
        </span>
        <span className="text-sm">
          Реализация:{" "}
          <strong className="font-mono">{formatRub(totals.saleValue)}</strong>
        </span>
      </Space>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <StockFilterBar
        initialFilters={initialFilters}
        warehouses={warehouses}
      />

      {/* Toolbar — no create button (read-only), CSV export on right */}
      <ERPToolbar
        selectedCount={selectedRowKeys.length}
        extraActions={exportButton}
      />

      {/* Table */}
      <ERPTable<StockBalanceRow>
        data={initialData.items}
        columns={columns}
        pagination={pagination}
        selection={selection}
        rowKey="id"
        emptyText="Нет остатков"
        sticky
      />

      {/* Totals footer */}
      {summaryFooter}
    </div>
  );
}

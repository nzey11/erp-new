"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Dropdown, Button } from "antd";
import { MoreOutlined, CheckCircleOutlined } from "@ant-design/icons";
import type { StockDocumentFilters } from "@/lib/domain/stock-documents/parse-filters";
import type { GetStockDocumentsResult, StockDocumentRow } from "@/lib/domain/stock-documents/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { StockDocumentFilterBar } from "./stock-document-filter-bar";
import { getStockDocumentColumns } from "./stock-document-columns";
import { getStockDocumentRowActions } from "./stock-document-row-actions";
import { csrfFetch } from "@/lib/client/csrf";

interface Warehouse {
  id: string;
  name: string;
}

interface StockDocumentsClientProps {
  initialData: GetStockDocumentsResult;
  initialFilters: StockDocumentFilters;
  warehouses: Warehouse[];
}

/**
 * Stock documents client shell.
 *
 * UI state: selection, bulk-confirm loading.
 * Server data: initialData is read directly — never frozen in useState.
 */
export function StockDocumentsClient({
  initialData,
  initialFilters,
  warehouses,
}: StockDocumentsClientProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // mounted guard — suppress SSR-only content
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Server data — never frozen
  const data = initialData;

  const handleRowAction = async (
    type: "open" | "confirm" | "cancel",
    row: StockDocumentRow
  ) => {
    if (type === "open") {
      router.push(`/documents/${row.id}`);
      return;
    }

    const endpoint =
      type === "confirm"
        ? `/api/accounting/documents/${row.id}/confirm`
        : `/api/accounting/documents/${row.id}/cancel`;

    try {
      const res = await csrfFetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      message.success(type === "confirm" ? "Документ подтверждён" : "Документ отменён");
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedRowKeys.length === 0) return;
    setBulkConfirming(true);
    try {
      const res = await csrfFetch("/api/accounting/documents/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRowKeys }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      const result = await res.json();
      message.success(
        `Подтверждено: ${result.confirmed}, пропущено: ${result.skipped}`
      );
      setSelectedRowKeys([]);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Ошибка массового подтверждения");
    } finally {
      setBulkConfirming(false);
    }
  };

  const selection: ERPSelection<StockDocumentRow> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };

  const columns = getStockDocumentColumns();

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

  const rowActions = (row: StockDocumentRow) => {
    const items = getStockDocumentRowActions(row, handleRowAction);
    return (
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button type="text" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <StockDocumentFilterBar
        initialFilters={initialFilters}
        warehouses={warehouses}
      />

      {/* Toolbar */}
      <ERPToolbar
        selectedCount={selectedRowKeys.length}
        bulkActions={
          selectedRowKeys.length > 0 ? (
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleBulkConfirm}
              loading={bulkConfirming}
              size="small"
            >
              Подтвердить выбранные ({selectedRowKeys.length})
            </Button>
          ) : undefined
        }
      />

      {/* Table */}
      {mounted && (
        <ERPTable<StockDocumentRow>
          data={data.items}
          columns={columns}
          pagination={pagination}
          selection={selection}
          rowActions={rowActions}
          rowKey="id"
          sticky
          emptyText="Нет документов"
          onChange={({ sortField, sortOrder }) => handleSortChange({ sortField, sortOrder })}
          onRefresh={() => router.refresh()}
        />
      )}
    </div>
  );
}

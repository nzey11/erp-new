"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { App, Dropdown, Button } from "antd";
import { MoreOutlined, CheckCircleOutlined, StopOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import type { DocumentFilters } from "@/lib/domain/documents/parse-filters";
import { serializeDocumentFilters } from "@/lib/domain/documents/parse-filters";
import type { GetDocumentsResult, DocumentRow } from "@/lib/domain/documents/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { DocumentFilterBar } from "./document-filter-bar";
import { getDocumentColumns } from "./document-table-columns";
import { getDocumentRowActions } from "./document-row-actions";
import { csrfFetch } from "@/lib/client/csrf";

interface Counterparty {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface DocumentsPageClientProps {
  initialData: GetDocumentsResult;
  initialFilters: DocumentFilters;
  counterparties: Counterparty[];
  warehouses: Warehouse[];
}

// Group tabs — mirrors legacy DocumentsPage
const GROUP_TABS = [
  { value: "", label: "Все" },
  { value: "stock", label: "Склад" },
  { value: "purchases", label: "Закупки" },
  { value: "sales", label: "Продажи" },
  { value: "finance", label: "Финансы" },
];

/**
 * Documents page client shell.
 *
 * UI state: tab (group), selection, bulk-confirm loading.
 * Server data: initialData is read directly — never frozen in useState.
 */
export function DocumentsPageClient({
  initialData,
  initialFilters,
  counterparties,
  warehouses,
}: DocumentsPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // antd Tabs with dynamic content need mounted guard for SSR safety
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Server data — never frozen
  const data = initialData;

  const activeGroup = initialFilters.group ?? "";

  const handleGroupChange = (group: string) => {
    const params = serializeDocumentFilters(
      {
        ...initialFilters,
        group: group || undefined,
        type: undefined, // reset type when switching group
        page: 1,
      },
      new URLSearchParams(searchParams.toString())
    );
    // Remove empty values
    params.forEach((value, key) => {
      if (!value || value === "undefined") params.delete(key);
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleRowAction = async (
    type: "open" | "confirm" | "cancel",
    row: DocumentRow
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

  const selection: ERPSelection<DocumentRow> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };

  const columns = getDocumentColumns();

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

  const rowActions = (row: DocumentRow) => {
    const items = getDocumentRowActions(row, handleRowAction);
    return (
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button type="text" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Документы" />

      {/* Group tabs — changes ?group= in URL */}
      {mounted && (
        <div className="flex gap-1 border-b">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleGroupChange(tab.value)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeGroup === tab.value
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <DocumentFilterBar
        initialFilters={initialFilters}
        counterparties={counterparties}
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
        extraActions={
          <Button
            icon={<StopOutlined />}
            size="small"
            href={`/api/accounting/documents/export?group=${activeGroup || ""}`}
            target="_blank"
          >
            Экспорт CSV
          </Button>
        }
      />

      {/* Table */}
      <ERPTable<DocumentRow>
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
    </div>
  );
}

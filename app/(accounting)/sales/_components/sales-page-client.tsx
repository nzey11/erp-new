"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { App, Dropdown, Button } from "antd";
import {
  MoreOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import type { SalesFilters } from "@/lib/domain/sales/parse-filters";
import { serializeSalesFilters } from "@/lib/domain/sales/parse-filters";
import type { GetDocumentsResult, DocumentRow } from "@/lib/domain/documents/queries";
import type { SalesOrderFilters } from "@/lib/domain/sales-orders/parse-filters";
import type { GetSalesOrdersResult } from "@/lib/domain/sales-orders/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { SalesFilterBar } from "./sales-filter-bar";
import { getSalesColumns } from "./sales-table-columns";
import { getSalesRowActions } from "./sales-row-actions";
import { csrfFetch } from "@/lib/client/csrf";
// Legacy imports — Strangler coexistence
import {
  DOC_TYPE_OPTIONS,
  CreateDocumentDialog,
} from "@/components/domain/accounting";
import { SalesOrdersPageClient } from "./sales-orders-page-client";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";

const SALES_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "sales");

interface Counterparty {
  id: string;
  name: string;
}

interface SalesPageClientProps {
  /** Server-fetched data for the current simple tab */
  initialData: GetDocumentsResult;
  initialFilters: SalesFilters;
  counterparties: Counterparty[];
  /** Server-fetched data for the sales_order tab */
  salesOrderInitialData: GetSalesOrdersResult;
  salesOrderInitialFilters: SalesOrderFilters;
}

/** Sales tabs definition */
const SALES_TABS = [
  { value: "all", label: "Все продажи" },
  { value: "sales_order", label: "Заказы покупателей" },
  { value: "outgoing_shipment", label: "Отгрузки" },
  { value: "customer_return", label: "Возвраты" },
  { value: "profitability", label: "Прибыльность" },
] as const;

type SalesTabValue = (typeof SALES_TABS)[number]["value"];

/**
 * Sales page client shell — Strangler orchestrator.
 *
 * Simple tabs (all / outgoing_shipment / customer_return):
 *   → server-fetched data via getSalesDocuments() → ERPTable
 *
 * sales_order tab:
 *   → legacy SalesOrdersView (DataGrid, client-fetched) — NOT migrated yet (Step 4b)
 *
 * profitability tab:
 *   → legacy ProfitabilityView (DataGrid + KPI cards) — stays legacy (defer)
 *
 * URL-driven: ?tab= drives active tab + server re-fetch for simple tabs.
 */
export function SalesPageClient({
  initialData,
  initialFilters,
  counterparties,
  salesOrderInitialData,
  salesOrderInitialFilters,
}: SalesPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Warehouses needed for CreateDocumentDialog
  const { warehouses } = useAccountingRefs(100);
  const [createOpen, setCreateOpen] = useState(false);

  // mounted guard — suppress SSR-only content
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Selection state (simple tabs only)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Server data — never frozen in useState
  const data = initialData;

  const activeTab: SalesTabValue =
    (initialFilters.tab as SalesTabValue) ?? "all";

  const isSimpleTab =
    activeTab === "all" ||
    activeTab === "outgoing_shipment" ||
    activeTab === "customer_return";

  // ─── Tab switching ───────────────────────────────────────────────────────────

  const handleTabChange = (tab: SalesTabValue) => {
    const params = serializeSalesFilters(
      {
        ...initialFilters,
        tab: tab === "all" ? undefined : tab,
        page: 1,
      },
      new URLSearchParams(searchParams.toString())
    );
    params.forEach((value, key) => {
      if (!value || value === "undefined") params.delete(key);
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // ─── Row actions (simple tabs) ───────────────────────────────────────────────

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

  // ─── Bulk confirm (simple tabs) ──────────────────────────────────────────────

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

  // ─── Export ──────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    try {
      const exportType =
        activeTab === "outgoing_shipment" || activeTab === "customer_return"
          ? activeTab
          : "";
      const params = new URLSearchParams({ group: "sales" });
      if (exportType) params.set("type", exportType);
      const res = await fetch(
        `/api/accounting/documents/export?${params.toString()}`
      );
      if (!res.ok) throw new Error("Ошибка экспорта");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success("Экспорт завершён");
    } catch {
      message.error("Ошибка экспорта");
    }
  }, [activeTab]);

  // ─── Table props (simple tabs) ───────────────────────────────────────────────

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

  const columns = getSalesColumns();

  const rowActions = (row: DocumentRow) => {
    const items = getSalesRowActions(row, handleRowAction);
    return (
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button type="text" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* PageHeader with primary action */}
      <PageHeader
        title="Продажи"
        actions={
          activeTab !== "profitability" && mounted ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              Новый документ
            </Button>
          ) : undefined
        }
      />

      {/* Tab bar */}
      {mounted && (
        <div className="flex gap-1 border-b">
          {SALES_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.value
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Simple tabs: all / outgoing_shipment / customer_return ── */}
      {isSimpleTab && (
        <>
          <SalesFilterBar
            initialFilters={initialFilters}
            counterparties={counterparties}
          />

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
                icon={<DownloadOutlined />}
                size="small"
                onClick={handleExport}
              >
                CSV
              </Button>
            }
          />

          <ERPTable<DocumentRow>
            data={data.items}
            columns={columns}
            pagination={pagination}
            selection={selection}
            rowActions={rowActions}
            rowKey="id"
            sticky
            emptyText="Нет документов продажи"
          />
        </>
      )}

      {/* ── sales_order tab: ERPTable-based SalesOrdersPageClient ── */}
      {mounted && activeTab === "sales_order" && (
        <SalesOrdersPageClient
          initialData={salesOrderInitialData}
          initialFilters={salesOrderInitialFilters}
        />
      )}

      {/* ── profitability tab: legacy (defer) ── */}
      {mounted && activeTab === "profitability" && (
        <LegacySalesProfitability />
      )}

      {/* ── CreateDocumentDialog (legacy, coexisting) ── */}
      {mounted && (
        <CreateDocumentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Новый документ продажи"
          docTypes={SALES_TYPES}
          warehouses={warehouses}
          counterparties={counterparties}
          onSuccess={() => router.refresh()}
          counterpartyRedirect="sales"
        />
      )}
    </div>
  );
}

// ─── Lazy legacy profitability — extracted to avoid importing profit internals ──

function LegacySalesProfitability() {
  // Dynamically import the legacy profitability section to avoid
  // pulling all its state into the main client shell.
  // For now: render a placeholder with a link to reload to profitability.
  // The full legacy profitability UI is preserved in the original sales/page.tsx
  // until a migration decision is made.
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
      <p className="text-sm">
        Отчёт прибыльности временно доступен только в старом интерфейсе.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Button, Dropdown, Tabs, Card, Input, Typography } from "antd";
import { DownloadOutlined, PlusOutlined, MoreOutlined, CheckOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { CreateDocumentDialog, DOC_TYPE_OPTIONS } from "@/components/domain/accounting";
import { csrfFetch } from "@/lib/client/csrf";
import { formatRub } from "@/lib/shared/utils";
import type { PurchaseFilters } from "@/lib/domain/purchases/parse-filters";
import type { GetPurchaseDocumentsResult, PurchaseDocument } from "@/lib/domain/purchases/queries";
import { PurchaseFilterBar } from "./purchase-filter-bar";
import { getPurchaseColumns } from "./purchase-table-columns";
import { getPurchaseRowActions } from "./purchase-row-actions";

const PURCHASE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "purchases");

interface Counterparty {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface SupplierRow {
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  docCount: number;
}

interface MonthRow {
  month: string;
  totalAmount: number;
  docCount: number;
}

interface PurchaseAnalyticsData {
  bySupplier: SupplierRow[];
  byMonth: MonthRow[];
  totals: {
    totalAmount: number;
    totalDocs: number;
    averageOrder: number;
  };
}

interface PurchasesPageClientProps {
  initialData: GetPurchaseDocumentsResult;
  initialFilters: PurchaseFilters;
  counterparties: Counterparty[];
  warehouses: Warehouse[];
  // For analytics tab (pass-through, not migrated)
  analyticsInitialDateFrom: string;
  analyticsInitialDateTo: string;
}

const supplierColumns: ERPColumn<SupplierRow>[] = [
  {
    key: "supplierName",
    dataIndex: "supplierName",
    title: "Поставщик",
    width: 280,
  },
  {
    key: "docCount",
    dataIndex: "docCount",
    title: "Приёмок",
    width: 100,
    align: "right",
    render: (_, row) => <span className="font-mono">{row.docCount}</span>,
  },
  {
    key: "totalAmount",
    dataIndex: "totalAmount",
    title: "Сумма закупок",
    width: 160,
    align: "right",
    render: (value) => formatRub(value as number),
  },
];

const monthColumns: ERPColumn<MonthRow>[] = [
  {
    key: "month",
    dataIndex: "month",
    title: "Месяц",
    width: 130,
  },
  {
    key: "docCount",
    dataIndex: "docCount",
    title: "Приёмок",
    width: 100,
    align: "right",
    render: (_, row) => <span className="font-mono">{row.docCount}</span>,
  },
  {
    key: "totalAmount",
    dataIndex: "totalAmount",
    title: "Сумма",
    width: 160,
    align: "right",
    render: (value) => formatRub(value as number),
  },
];

/**
 * Purchases page client shell — tab orchestrator.
 *
 * Owns:
 * - Active tab state
 * - Create document dialog state
 * - Row selection and bulk actions
 * - Analytics data fetching (legacy)
 *
 * Document tabs → ERPTable architecture
 * Analytics tab → ERPTable (migrated)
 */
export function PurchasesPageClient({
  initialData,
  initialFilters,
  counterparties,
  warehouses,
  analyticsInitialDateFrom,
  analyticsInitialDateTo,
}: PurchasesPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state: "all" | "purchase_order" | "incoming_shipment" | "supplier_return" | "analytics"
  const [tab, setTab] = useState<string>(() => {
    // Initialize from URL filter type if present
    if (initialFilters.type) {
      return initialFilters.type;
    }
    return "all";
  });

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Selection state for bulk actions
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Export loading state
  const [exportLoading, setExportLoading] = useState(false);

  // Analytics state (legacy)
  const [analyticsData, setAnalyticsData] = useState<PurchaseAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(analyticsInitialDateFrom);
  const [dateTo, setDateTo] = useState(analyticsInitialDateTo);

  // Columns for ERPTable
  const columns = useMemo(() => getPurchaseColumns(), []);

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

  // Pagination for ERPTable
  const pagination: ERPPagination = {
    current: initialData.page,
    pageSize: initialData.pageSize,
    total: initialData.total,
  };

  // Selection for ERPTable
  const selection: ERPSelection<PurchaseDocument> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  // Load analytics when tab changes to analytics
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const res = await fetch(`/api/accounting/reports/purchases-analytics?${params}`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setAnalyticsData(data);
    } catch {
      message.error("Ошибка загрузки аналитики закупок");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateFrom, dateTo, message]);

  useEffect(() => {
    if (tab === "analytics") {
      loadAnalytics();
    }
  }, [tab, loadAnalytics]);

  // Handle tab change - update URL filter
  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setSelectedRowKeys([]); // Clear selection on tab change

    // Update URL with type filter (except for analytics)
    if (newTab === "analytics") {
      return; // Don't modify URL for analytics tab
    }

    const params = new URLSearchParams(window.location.search);
    if (newTab === "all") {
      params.delete("type");
    } else {
      params.set("type", newTab);
    }
    // Reset to page 1 on tab change
    params.set("page", "1");

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Row actions handler
  const handleRowAction = useCallback(
    async (action: "open" | "confirm" | "cancel", row: PurchaseDocument) => {
      switch (action) {
        case "open":
          router.push(`/documents/${row.id}`);
          break;
        case "confirm":
          try {
            const res = await csrfFetch(`/api/accounting/documents/${row.id}/confirm`, {
              method: "POST",
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Ошибка");
            }
            message.success("Документ подтверждён");
            router.refresh();
          } catch (e) {
            message.error(e instanceof Error ? e.message : "Ошибка подтверждения");
          }
          break;
        case "cancel":
          try {
            const res = await csrfFetch(`/api/accounting/documents/${row.id}/cancel`, {
              method: "POST",
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Ошибка");
            }
            message.success("Документ отменён");
            router.refresh();
          } catch (e) {
            message.error(e instanceof Error ? e.message : "Ошибка отмены");
          }
          break;
      }
    },
    [router, message]
  );

  // Row actions renderer for ERPTable
  const rowActions = useCallback(
    (row: PurchaseDocument) => (
      <Dropdown
        menu={{ items: getPurchaseRowActions(row, handleRowAction) }}
        placement="bottomRight"
        trigger={["click"]}
      >
        <Button type="text" icon={<MoreOutlined />} size="small" />
      </Dropdown>
    ),
    [handleRowAction]
  );

  // Bulk confirm action
  const handleBulkConfirm = useCallback(async () => {
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
      message.success(`Подтверждено: ${result.confirmed}, пропущено: ${result.skipped}`);
      setSelectedRowKeys([]);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Ошибка массового подтверждения");
    } finally {
      setBulkConfirming(false);
    }
  }, [selectedRowKeys, router, message]);

  // CSV export
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const res = await fetch(`/api/accounting/documents/export?group=purchases`);
      if (!res.ok) throw new Error("Ошибка экспорта");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchases_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success("Экспорт завершён");
    } catch {
      message.error("Ошибка экспорта");
    } finally {
      setExportLoading(false);
    }
  }, [message]);

  // Show create button only on document tabs
  const showCreateButton = tab !== "analytics";

  // Bulk actions for ERPToolbar
  const bulkActions = selectedRowKeys.length > 0 && (
    <Button
      type="primary"
      icon={<CheckOutlined />}
      onClick={handleBulkConfirm}
      loading={bulkConfirming}
    >
      Подтвердить выбранные
    </Button>
  );

  // Extra actions (CSV export)
  const extraActions = tab !== "analytics" && (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleExport}
      loading={exportLoading}
    >
      CSV
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Закупки"
        actions={
          showCreateButton ? (
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

      {/* Tab switcher — antd Tabs, labels only (content rendered below) */}
      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={[
          { key: "all",               label: "Все закупки" },
          { key: "purchase_order",    label: "Заказы поставщикам" },
          { key: "incoming_shipment", label: "Приёмки" },
          { key: "supplier_return",   label: "Возвраты поставщику" },
          { key: "analytics",         label: "Аналитика" },
        ]}
      />

      {/* Document tabs — new ERP architecture */}
      {tab !== "analytics" && (
        <div className="space-y-4">
          <PurchaseFilterBar
            initialFilters={initialFilters}
            counterparties={counterparties}
          />

          <ERPToolbar
            bulkActions={bulkActions}
            extraActions={extraActions}
            selectedCount={selectedRowKeys.length}
          />

          <ERPTable<PurchaseDocument>
            data={initialData.items}
            columns={columns}
            pagination={pagination}
            selection={selection}
            rowActions={rowActions}
            rowKey="id"
            emptyText="Нет документов"
            sticky
            onChange={({ sortField, sortOrder }) => handleSortChange({ sortField, sortOrder })}
          />
        </div>
      )}

      {/* Analytics tab — legacy (unchanged) */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {/* Date range */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Typography.Text strong>С</Typography.Text>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Typography.Text strong>По</Typography.Text>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
          </div>

          {/* Summary cards */}
          {analyticsData && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card title={<span className="text-sm text-muted-foreground">Всего закуплено</span>}>
                <p className="text-2xl font-bold">
                  {formatRub(analyticsData.totals.totalAmount)}
                </p>
              </Card>
              <Card title={<span className="text-sm text-muted-foreground">Количество приёмок</span>}>
                <p className="text-2xl font-bold">
                  {analyticsData.totals.totalDocs}
                </p>
              </Card>
              <Card title={<span className="text-sm text-muted-foreground">Средний чек</span>}>
                <p className="text-2xl font-bold">
                  {formatRub(analyticsData.totals.averageOrder)}
                </p>
              </Card>
            </div>
          )}

          {/* Top suppliers */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Топ поставщики
            </h3>
            <ERPTable<SupplierRow>
              data={analyticsData?.bySupplier ?? []}
              columns={supplierColumns}
              loading={analyticsLoading}
              emptyText="Нет данных за выбранный период"
              rowKey="supplierId"
            />
          </div>

          {/* Monthly dynamics */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Динамика расходов по месяцам
            </h3>
            <ERPTable<MonthRow>
              data={analyticsData?.byMonth ?? []}
              columns={monthColumns}
              loading={analyticsLoading}
              emptyText="Нет данных за выбранный период"
              rowKey="month"
            />
          </div>
        </div>
      )}

      {/* Create document dialog */}
      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый документ закупки"
        docTypes={PURCHASE_TYPES}
        warehouses={warehouses}
        counterparties={counterparties}
        onSuccess={() => router.refresh()}
        counterpartyRedirect="purchases"
      />
    </div>
  );
}

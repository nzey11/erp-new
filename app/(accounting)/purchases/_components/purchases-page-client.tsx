"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Dropdown } from "antd";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DownloadOutlined, PlusOutlined, MoreOutlined, CheckOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { ERPTable } from "@/components/erp/erp-table";
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

const supplierColumns: DataGridColumn<SupplierRow>[] = [
  {
    accessorKey: "supplierName",
    header: "Поставщик",
    size: 280,
    meta: { canHide: false },
  },
  {
    accessorKey: "docCount",
    header: "Приёмок",
    size: 100,
    meta: { align: "right" as const },
    cell: ({ row }) => <span className="font-mono">{row.original.docCount}</span>,
  },
  {
    accessorKey: "totalAmount",
    header: "Сумма закупок",
    size: 160,
    meta: { align: "right" as const },
    cell: ({ row }) => formatRub(row.original.totalAmount),
  },
];

const monthColumns: DataGridColumn<MonthRow>[] = [
  {
    accessorKey: "month",
    header: "Месяц",
    size: 130,
    meta: { canHide: false },
  },
  {
    accessorKey: "docCount",
    header: "Приёмок",
    size: 100,
    meta: { align: "right" as const },
    cell: ({ row }) => <span className="font-mono">{row.original.docCount}</span>,
  },
  {
    accessorKey: "totalAmount",
    header: "Сумма",
    size: 160,
    meta: { align: "right" as const },
    cell: ({ row }) => formatRub(row.original.totalAmount),
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
 * Document tabs → new ERPTable architecture
 * Analytics tab → legacy DataGrid (unchanged)
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

  // Mounted guard for Radix UI Tabs
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
  }, [dateFrom, dateTo]);

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
    [router]
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
  }, [selectedRowKeys, router]);

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
  }, []);

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

      {/* Tab switcher */}
      {mounted && (
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">Все закупки</TabsTrigger>
            <TabsTrigger value="purchase_order">Заказы поставщикам</TabsTrigger>
            <TabsTrigger value="incoming_shipment">Приёмки</TabsTrigger>
            <TabsTrigger value="supplier_return">Возвраты поставщику</TabsTrigger>
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

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
          />
        </div>
      )}

      {/* Analytics tab — legacy (unchanged) */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {/* Date range */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>С</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Всего закуплено
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatRub(analyticsData.totals.totalAmount)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Количество приёмок
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {analyticsData.totals.totalDocs}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Средний чек
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatRub(analyticsData.totals.averageOrder)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Top suppliers */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Топ поставщики
            </h3>
            <DataGrid
              data={analyticsData?.bySupplier ?? []}
              columns={supplierColumns}
              loading={analyticsLoading}
              emptyMessage="Нет данных за выбранный период"
              persistenceKey="purchases-analytics-suppliers"
              stickyHeader={false}
            />
          </div>

          {/* Monthly dynamics */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Динамика расходов по месяцам
            </h3>
            <DataGrid
              data={analyticsData?.byMonth ?? []}
              columns={monthColumns}
              loading={analyticsLoading}
              emptyMessage="Нет данных за выбранный период"
              persistenceKey="purchases-analytics-months"
              stickyHeader={false}
            />
          </div>
        </div>
      )}

      {/* Create document dialog */}
      {mounted && (
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
      )}
    </div>
  );
}

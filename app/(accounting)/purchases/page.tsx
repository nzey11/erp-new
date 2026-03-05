"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import { DocumentsTable, DOC_TYPE_OPTIONS, CreateDocumentDialog } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";

const PURCHASE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "purchases");

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Column definitions ───────────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const tableRef = useRef<DocumentsTableHandle>(null);
  const { warehouses, counterparties } = useAccountingRefs();

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<PurchaseAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const res = await fetch(`/api/accounting/reports/purchases-analytics?${params}`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setAnalyticsData(data);
    } catch {
      toast.error("Ошибка загрузки аналитики закупок");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const d = new Date();
    setDateTo(d.toISOString().split("T")[0]);
    d.setMonth(d.getMonth() - 1);
    setDateFrom(d.toISOString().split("T")[0]);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (tab === "analytics") {
      loadAnalytics();
    }
  }, [tab, loadAnalytics]);

  const handleExport = useCallback(async () => {
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
      toast.success("Экспорт завершён");
    } catch {
      toast.error("Ошибка экспорта");
    }
  }, []);

  // Determine groupFilter/typeFilter based on tab
  const getFilterProps = () => {
    switch (tab) {
      case "purchase_order": return { groupFilter: "", typeFilter: "purchase_order" };
      case "incoming_shipment": return { groupFilter: "", typeFilter: "incoming_shipment" };
      case "supplier_return": return { groupFilter: "", typeFilter: "supplier_return" };
      default: return { groupFilter: "purchases", typeFilter: "" };
    }
  };

  const filterProps = getFilterProps();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Закупки"
        actions={
          tab !== "analytics" ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Новый документ
              </Button>
            </div>
          ) : undefined
        }
      />

      {mounted && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">Все закупки</TabsTrigger>
            <TabsTrigger value="purchase_order">Заказы поставщикам</TabsTrigger>
            <TabsTrigger value="incoming_shipment">Приёмки</TabsTrigger>
            <TabsTrigger value="supplier_return">Возвраты</TabsTrigger>
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <div className="space-y-4">
              {/* Date range */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>С</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div className="flex items-center gap-2">
                  <Label>По</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
              </div>

              {/* Summary cards */}
              {analyticsData && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Всего закуплено</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatRub(analyticsData.totals.totalAmount)}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Количество приёмок</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{analyticsData.totals.totalDocs}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Средний чек</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatRub(analyticsData.totals.averageOrder)}</p></CardContent>
                  </Card>
                </div>
              )}

              {/* Top suppliers */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Топ поставщики</h3>
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
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Динамика расходов по месяцам</h3>
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
          </TabsContent>
        </Tabs>
      )}

      {mounted && tab !== "analytics" && (
        <DocumentsTable
          ref={tableRef}
          key={tab}
          groupFilter={filterProps.groupFilter}
          defaultTypeFilter={filterProps.typeFilter}
        />
      )}

      {mounted && (
        <CreateDocumentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Новый документ закупки"
          docTypes={PURCHASE_TYPES}
          warehouses={warehouses}
          counterparties={counterparties}
          onSuccess={() => tableRef.current?.refresh()}
          counterpartyRedirect="purchases"
        />
      )}
    </div>
  );
}

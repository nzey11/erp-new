"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ShoppingCart, User, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRub, formatDate } from "@/lib/shared/utils";
import { DocumentsTable, DOC_TYPE_OPTIONS, CreateDocumentDialog } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";
import Link from "next/link";

const SALES_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "sales");

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type DeliveryType = "pickup" | "courier";
type EcomStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

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
  customer: { id: string; name: string | null; phone: string | null; telegramUsername: string | null } | null;
  counterparty: { id: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  _count: { items: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── SalesOrdersView ──────────────────────────────────────────────────────────

function SalesOrdersView({ onRefresh }: { onRefresh?: () => void }) {
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
      if (key === "source") return null; // client-side only
      if (!value) return null;
      return value;
    },
  });

  const [sourceFilter, setSourceFilter] = useState<"all" | "ecom" | "manual">("all");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const allRows = grid.gridProps.data ?? [];
  const rows = sourceFilter === "all"
    ? allRows
    : sourceFilter === "ecom"
      ? allRows.filter((d) => d.customerId != null)
      : allRows.filter((d) => d.customerId == null);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/accounting/ecommerce/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
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
      const res = await fetch(`/api/accounting/documents/${id}/confirm`, { method: "POST" });
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
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.number}</span>,
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
        if (!ps) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className={cn("inline-block text-xs font-medium border rounded-full px-2.5 py-0.5", PAYMENT_STATUS_COLOR[ps])}>
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
        if (!dt) return <span className="text-muted-foreground text-xs">—</span>;
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
          <span className={cn(
            "inline-block text-xs font-medium border rounded-full px-2.5 py-0.5",
            ECOM_STATUS_COLOR[s] ?? "bg-gray-100 text-gray-700 border-gray-300"
          )}>
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
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Link href={`/documents/${doc.id}`}>
              <Button variant="ghost" size="icon" title="Просмотр">
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
            {isEcom && doc.status === "paid" && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "processing")}>
                В работу
              </Button>
            )}
            {isEcom && doc.status === "processing" && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "shipped")}>
                Отправить
              </Button>
            )}
            {isEcom && doc.status === "shipped" && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                onClick={() => handleUpdateStatus(doc.id, "delivered")}>
                Доставлен
              </Button>
            )}
            {!isEcom && doc.status === "draft" && (
              <Button variant="ghost" size="icon" title="Подтвердить"
                onClick={() => handleConfirm(doc.id)}>
                <span className="text-green-600 text-xs font-bold">✓</span>
              </Button>
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
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все заказы</SelectItem>
              <SelectItem value="ecom">🛒 Интернет-магазин</SelectItem>
              <SelectItem value="manual">👤 Менеджер</SelectItem>
            </SelectContent>
          </Select>
        ) : null,
      }}
    />
  );
}

interface ProfitRow {
  productId: string;
  productName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

interface ProfitData {
  byProduct: ProfitRow[];
  totals: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    averageMargin: number;
  };
}

export default function SalesPage() {
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const tableRef = useRef<DocumentsTableHandle>(null);
  const [mounted, setMounted] = useState(false);

  const { warehouses, counterparties } = useAccountingRefs(100);

  // Profitability state
  const [profitData, setProfitData] = useState<ProfitData | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadProfitability = useCallback(async () => {
    setProfitLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const res = await fetch(`/api/accounting/reports/profitability?${params}`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setProfitData(data);
    } catch {
      toast.error("Ошибка загрузки отчёта прибыльности");
    } finally {
      setProfitLoading(false);
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
    if (tab === "profitability") {
      loadProfitability();
    }
  }, [tab, loadProfitability]);

  // Export
  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/documents/export?group=sales`);
      if (!res.ok) throw new Error("Ошибка экспорта");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Экспорт завершён");
    } catch {
      toast.error("Ошибка экспорта");
    }
  }, []);

  const getFilterProps = () => {
    switch (tab) {
      case "sales_order": return { groupFilter: "", typeFilter: "sales_order" };
      case "outgoing_shipment": return { groupFilter: "", typeFilter: "outgoing_shipment" };
      case "customer_return": return { groupFilter: "", typeFilter: "customer_return" };
      default: return { groupFilter: "sales", typeFilter: "" };
    }
  };

  const filterProps = getFilterProps();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Продажи"
        actions={
          tab !== "profitability" ? (
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

      {mounted && <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Все продажи</TabsTrigger>
          <TabsTrigger value="sales_order">Заказы покупателей</TabsTrigger>
          <TabsTrigger value="outgoing_shipment">Отгрузки</TabsTrigger>
          <TabsTrigger value="customer_return">Возвраты</TabsTrigger>
          <TabsTrigger value="profitability">Прибыльность</TabsTrigger>
        </TabsList>

        <TabsContent value="profitability">
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
            {profitData && (
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Выручка</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{formatRub(profitData.totals.totalRevenue)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Себестоимость</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-red-600">{formatRub(profitData.totals.totalCost)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Валовая прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitData.totals.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitData.totals.totalProfit)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Маржа: {profitData.totals.averageMargin.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Profitability table */}
            <ProfitabilityTable data={profitData} loading={profitLoading} />
          </div>
        </TabsContent>
      </Tabs>}

      {/* Document list for non-profitability tabs */}
      {mounted && tab !== "profitability" && tab !== "sales_order" && (
        <DocumentsTable
          ref={tableRef}
          key={tab}
          groupFilter={filterProps.groupFilter}
          defaultTypeFilter={filterProps.typeFilter}
        />
      )}
      {mounted && tab === "sales_order" && (
        <SalesOrdersView onRefresh={() => tableRef.current?.refresh()} />
      )}

      {mounted && <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый документ продажи"
        docTypes={SALES_TYPES}
        warehouses={warehouses}
        counterparties={counterparties}
        onSuccess={() => tableRef.current?.refresh()}
        counterpartyRedirect="sales"
      />}
    </div>
  );
}

// Extracted profitability sub-table
const profitColumns: DataGridColumn<ProfitRow>[] = [
  {
    accessorKey: "productName",
    header: "Товар",
    size: 250,
    meta: { canHide: false },
    cell: ({ row }) => (
      <span>
        <span className="font-medium">{row.original.productName}</span>
        {row.original.sku && <span className="ml-2 text-xs text-muted-foreground">{row.original.sku}</span>}
      </span>
    ),
  },
  {
    accessorKey: "quantitySold",
    header: "Продано",
    size: 100,
    meta: { align: "right" as const },
    cell: ({ row }) => <span className="font-mono">{row.original.quantitySold}</span>,
  },
  {
    accessorKey: "revenue",
    header: "Выручка",
    size: 130,
    meta: { align: "right" as const },
    cell: ({ row }) => formatRub(row.original.revenue),
  },
  {
    accessorKey: "cost",
    header: "Себестоимость",
    size: 130,
    meta: { align: "right" as const },
    cell: ({ row }) => formatRub(row.original.cost),
  },
  {
    accessorKey: "profit",
    header: "Прибыль",
    size: 130,
    meta: { align: "right" as const },
    cell: ({ row }) => (
      <span className={`font-medium ${row.original.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
        {formatRub(row.original.profit)}
      </span>
    ),
  },
  {
    accessorKey: "margin",
    header: "Маржа",
    size: 80,
    meta: { align: "right" as const },
    cell: ({ row }) => `${row.original.margin.toFixed(1)}%`,
  },
];

function ProfitabilityTable({ data, loading }: { data: ProfitData | null; loading: boolean }) {
  return (
    <DataGrid
      data={data?.byProduct ?? []}
      columns={profitColumns}
      loading={loading}
      emptyMessage="Нет данных за выбранный период"
      persistenceKey="sales-profitability"
      stickyHeader={false}
    />
  );
}

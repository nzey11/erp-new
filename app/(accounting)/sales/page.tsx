"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import { DocumentsTable, DOC_TYPE_OPTIONS } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";

const SALES_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "sales");

interface Warehouse { id: string; name: string }
interface Counterparty { id: string; name: string }

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
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);
  const tableRef = useRef<DocumentsTableHandle>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createCounterpartyId, setCreateCounterpartyId] = useState("");

  // Profitability state
  const [profitData, setProfitData] = useState<ProfitData | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounting/warehouses").then((r) => r.json()),
      fetch("/api/accounting/counterparties?limit=100").then((r) => r.json()),
    ]).then(([wh, cp]) => {
      setWarehouses(wh || []);
      setCounterparties(cp.data || []);
    });
  }, []);

  useEffect(() => {
    if (tab === "profitability") {
      loadProfitability();
    }
  }, [tab, dateFrom, dateTo]);

  const loadProfitability = async () => {
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
  };

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { type: createType, items: [] };
      if (createWarehouseId) body.warehouseId = createWarehouseId;
      if (createCounterpartyId) body.counterpartyId = createCounterpartyId;

      const res = await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Документ создан");
      setCreateOpen(false);
      setCreateType("");
      setCreateWarehouseId("");
      setCreateCounterpartyId("");
      tableRef.current?.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

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
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Новый документ
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
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
      </Tabs>

      {/* Document list for non-profitability tabs */}
      {tab !== "profitability" && (
        <DocumentsTable
          ref={tableRef}
          key={tab}
          groupFilter={filterProps.groupFilter}
          defaultTypeFilter={filterProps.typeFilter}
        />
      )}

      {/* Create Dialog - keep below */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый документ продажи</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {SALES_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createType && (
              <div className="grid gap-2">
                <Label>Склад</Label>
                <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createType && (
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <Select value={createCounterpartyId} onValueChange={setCreateCounterpartyId}>
                  <SelectTrigger><SelectValue placeholder="Выберите контрагента" /></SelectTrigger>
                  <SelectContent>
                    {counterparties.map((cp) => (
                      <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

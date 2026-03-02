"use client";

import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatRub, formatNumber } from "@/lib/shared/utils";
import { DocumentsTable } from "@/components/accounting";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

interface StockRow {
  id: string; // Composite key: productId-warehouseId
  productId: string;
  productName: string;
  sku: string | null;
  categoryName: string | null;
  warehouseId: string;
  warehouseName: string;
  unitShortName: string;
  quantity: number;
  reserve: number;
  available: number;
  purchasePrice: number | null;
  salePrice: number | null;
  costValue: number | null;
  saleValue: number | null;
}

interface Totals {
  totalQuantity: number;
  totalReserve: number;
  totalAvailable: number;
  totalCostValue: number;
  totalSaleValue: number;
}

interface Warehouse {
  id: string;
  name: string;
}

const STOCK_DOC_TYPES = [
  { value: "inventory_count", label: "Инвентаризация" },
  { value: "write_off", label: "Списание" },
  { value: "stock_receipt", label: "Оприходование" },
];

export default function StockPage() {
  const [tab, setTab] = useState("balances");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Create document dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("");
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const grid = useDataGrid<StockRow>({
    endpoint: "/api/accounting/stock",
    enablePagination: false,
    enableSearch: true,
    syncUrl: false,
    defaultFilters: { enhanced: "true", warehouseId: "" },
    filterToParam: (key, value) => {
      if (key === "enhanced") return "true";
      if (!value) return null;
      return value;
    },
    responseAdapter: (json) => {
      const obj = json as { records?: Omit<StockRow, "id">[]; totals?: Totals };
      const records = Array.isArray(obj.records) ? obj.records : [];
      const data = records.map(r => ({ ...r, id: `${r.productId}-${r.warehouseId}` }));
      return { data, total: 0 };
    },
  });

  // Compute totals client-side from loaded data
  const totals = useMemo<Totals | null>(() => {
    if (grid.data.length === 0) return null;
    return {
      totalQuantity: grid.data.reduce((s, r) => s + r.quantity, 0),
      totalReserve: grid.data.reduce((s, r) => s + r.reserve, 0),
      totalAvailable: grid.data.reduce((s, r) => s + r.available, 0),
      totalCostValue: grid.data.reduce((s, r) => s + (r.costValue ?? 0), 0),
      totalSaleValue: grid.data.reduce((s, r) => s + (r.saleValue ?? 0), 0),
    };
  }, [grid.data]);

  useEffect(() => {
    fetch("/api/accounting/warehouses")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
  }, []);

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    if (!createWarehouseId) {
      toast.error("Выберите склад");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type: createType,
        warehouseId: createWarehouseId,
        items: [],
      };

      const res = await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      const doc = await res.json();

      // Auto-fill inventory with current stock data
      if (createType === "inventory_count") {
        await fetch(`/api/accounting/documents/${doc.id}/fill-inventory`, {
          method: "POST",
        });
      }

      toast.success("Документ создан");
      setCreateOpen(false);
      setCreateType("");
      setCreateWarehouseId("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  const getDocFilterProps = () => {
    switch (tab) {
      case "inventory": return { groupFilter: "", defaultTypeFilter: "inventory_count" };
      case "write_off": return { groupFilter: "", defaultTypeFilter: "write_off" };
      case "stock_receipt": return { groupFilter: "", defaultTypeFilter: "stock_receipt" };
      default: return { groupFilter: "stock", defaultTypeFilter: "" };
    }
  };

  const showCreateButton = tab !== "balances";

  const stockColumns: DataGridColumn<StockRow>[] = [
    {
      accessorKey: "productName",
      header: "Товар",
      size: 250,
      meta: { canHide: false },
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.productName}</span>
          {row.original.sku && (
            <span className="ml-2 text-xs text-muted-foreground">{row.original.sku}</span>
          )}
          {row.original.categoryName && (
            <div className="text-xs text-muted-foreground">{row.original.categoryName}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "warehouseName",
      header: "Склад",
      size: 150,
    },
    {
      accessorKey: "quantity",
      header: "Количество",
      size: 120,
      meta: { align: "right" as const },
      cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.quantity)}</span>,
    },
    {
      accessorKey: "reserve",
      header: "Резерв",
      size: 100,
      meta: { align: "right" as const },
      cell: ({ row }) =>
        row.original.reserve > 0 ? (
          <span className="font-mono text-amber-600">{formatNumber(row.original.reserve)}</span>
        ) : (
          <span className="font-mono">0</span>
        ),
    },
    {
      accessorKey: "available",
      header: "Доступно",
      size: 110,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className={`font-mono ${row.original.available < 0 ? "text-red-600 font-bold" : ""}`}>
          {formatNumber(row.original.available)}
        </span>
      ),
    },
    {
      accessorKey: "costValue",
      header: "Себестоимость",
      size: 140,
      meta: { align: "right" as const },
      cell: ({ row }) => row.original.costValue != null ? formatRub(row.original.costValue) : "\u2014",
    },
    {
      accessorKey: "saleValue",
      header: "Цена реализации",
      size: 150,
      meta: { align: "right" as const },
      cell: ({ row }) => row.original.saleValue != null ? formatRub(row.original.saleValue) : "\u2014",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Склад"
        description="Товарные остатки и складские операции"
        actions={
          showCreateButton ? (
            <Button onClick={() => {
              if (tab === "inventory") setCreateType("inventory_count");
              else if (tab === "write_off") setCreateType("write_off");
              else if (tab === "stock_receipt") setCreateType("stock_receipt");
              else setCreateType("");
              setCreateOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Новый документ
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="balances">Остатки</TabsTrigger>
          <TabsTrigger value="inventory">Инвентаризации</TabsTrigger>
          <TabsTrigger value="write_off">Списания</TabsTrigger>
          <TabsTrigger value="stock_receipt">Оприходования</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Balances tab */}
      {tab === "balances" && (
        <DataGrid
          {...grid.gridProps}
          columns={stockColumns}
          emptyMessage="Нет остатков"
          persistenceKey="stock-balances"
          toolbar={{
            ...grid.gridProps.toolbar,
            search: {
              value: grid.search,
              onChange: grid.setSearch,
              placeholder: "Поиск по товару...",
            },
            filters: (
              <Select value={grid.filters.warehouseId || "all"} onValueChange={(v) => grid.setFilter("warehouseId", v === "all" ? "" : v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Все склады" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все склады</SelectItem>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
            actions: (
              <Button variant="outline" size="sm" onClick={() => grid.mutate.refresh()}>
                Обновить
              </Button>
            ),
          }}
          footer={
            totals && grid.data.length > 0 ? (
              <tr className="font-medium">
                <td className="py-1.5 px-2" colSpan={2}>Итого</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatNumber(totals.totalQuantity)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatNumber(totals.totalReserve)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatNumber(totals.totalAvailable)}</td>
                <td className="py-1.5 px-2 text-right">{formatRub(totals.totalCostValue)}</td>
                <td className="py-1.5 px-2 text-right">{formatRub(totals.totalSaleValue)}</td>
              </tr>
            ) : undefined
          }
        />
      )}

      {/* Document tabs (Inventory, Write-offs, Receipts) */}
      {tab !== "balances" && (
        <DocumentsTable
          key={`${refreshKey}-${tab}`}
          groupFilter={getDocFilterProps().groupFilter}
          defaultTypeFilter={getDocFilterProps().defaultTypeFilter}
        />
      )}

      {/* Create Document Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый складской документ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {STOCK_DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Склад *</Label>
              <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

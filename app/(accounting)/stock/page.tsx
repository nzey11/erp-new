"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { csrfFetch } from "@/lib/client/csrf";
import { PageHeader } from "@/components/page-header";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { formatRub, formatNumber } from "@/lib/shared/utils";
import { toast } from "sonner";
import { DocumentsTable, CreateDocumentDialog } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";

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

const STOCK_DOC_TYPES = [
  { value: "stock_transfer", label: "Перемещение" },
  { value: "inventory_count", label: "Инвентаризация" },
  { value: "write_off", label: "Списание" },
  { value: "stock_receipt", label: "Оприходование" },
];

export default function StockPage() {
  const [tab, setTab] = useState("balances");

  // SSR safety: prevent hydration mismatch with Radix UI Tabs
  // Radix generates non-deterministic IDs during SSR vs client
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Create document dialog
  const [createOpen, setCreateOpen] = useState(false);
  const tableRef = useRef<DocumentsTableHandle>(null);

  const { warehouses } = useAccountingRefs();

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

  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (grid.filters.warehouseId) params.set("warehouseId", grid.filters.warehouseId);
      if (grid.search) params.set("search", grid.search);
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
    }
  }, [grid.filters.warehouseId, grid.search]);

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
              setCreateOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Новый документ
            </Button>
          ) : undefined
        }
      />

      {mounted ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="balances">Остатки</TabsTrigger>
            <TabsTrigger value="inventory">Инвентаризации</TabsTrigger>
            <TabsTrigger value="write_off">Списания</TabsTrigger>
            <TabsTrigger value="stock_receipt">Оприходования</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        // SSR placeholder: static representation to avoid hydration mismatch
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-background text-foreground shadow">
            Остатки
          </div>
          <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
            Инвентаризации
          </div>
          <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
            Списания
          </div>
          <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
            Оприходования
          </div>
        </div>
      )}

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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => grid.mutate.refresh()}>
                  Обновить
                </Button>
              </div>
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
          ref={tableRef}
          key={tab}
          groupFilter={getDocFilterProps().groupFilter}
          defaultTypeFilter={getDocFilterProps().defaultTypeFilter}
        />
      )}

      {/* Create Document Dialog */}
      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый складской документ"
        docTypes={STOCK_DOC_TYPES}
        warehouses={warehouses}
        counterparties={[]}
        requireWarehouse
        showTargetWarehouse
        onSuccess={() => tableRef.current?.refresh()}
        onAfterCreate={async (doc, type) => {
          if (type === "inventory_count") {
            await csrfFetch(`/api/accounting/documents/${doc.id}/fill-inventory`, { method: "POST" });
          }
        }}
      />
    </div>
  );
}

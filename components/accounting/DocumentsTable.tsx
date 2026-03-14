"use client";

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Check, X, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { csrfFetch } from "@/lib/client/csrf";
import Link from "next/link";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

export interface Document {
  id: string;
  number: string;
  type: string;
  typeName: string;
  status: string;
  statusName: string;
  date: string;
  totalAmount: number;
  warehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
  _count: { items: number };
}

export const DOC_TYPE_OPTIONS = [
  { value: "stock_receipt", label: "Оприходование", group: "stock" },
  { value: "write_off", label: "Списание", group: "stock" },
  { value: "stock_transfer", label: "Перемещение", group: "stock" },
  { value: "inventory_count", label: "Инвентаризация", group: "stock" },
  { value: "purchase_order", label: "Заказ поставщику", group: "purchases" },
  { value: "incoming_shipment", label: "Приёмка", group: "purchases" },
  { value: "supplier_return", label: "Возврат поставщику", group: "purchases" },
  { value: "sales_order", label: "Заказ покупателя", group: "sales" },
  { value: "outgoing_shipment", label: "Отгрузка", group: "sales" },
  { value: "customer_return", label: "Возврат покупателя", group: "sales" },
  { value: "incoming_payment", label: "Входящий платёж", group: "finance" },
  { value: "outgoing_payment", label: "Исходящий платёж", group: "finance" },
];

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

export interface DocumentsTableHandle {
  refresh: () => void;
}

interface DocumentsTableProps {
  groupFilter?: string;
  defaultTypeFilter?: string;
  onRefresh?: () => void;
}

export const DocumentsTable = forwardRef<DocumentsTableHandle, DocumentsTableProps>(
function DocumentsTable({ groupFilter = "", defaultTypeFilter = "", onRefresh }: DocumentsTableProps, ref) {
  const [typeFilter, setTypeFilter] = useState(defaultTypeFilter);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const filteredTypes = groupFilter
    ? DOC_TYPE_OPTIONS.filter((t) => t.group === groupFilter)
    : DOC_TYPE_OPTIONS;

  // Build extra params for group/type/status filters
  const grid = useDataGrid<Document>({
    endpoint: "/api/accounting/documents",
    pageSize: 25,
    enablePagination: true,
    enableSearch: true,
    sortable: true,
    defaultSort: { field: "date", order: "desc" },
    enablePageSizeChange: true,
    pageSizeOptions: [10, 25, 50, 100],
    defaultFilters: {
      type: defaultTypeFilter,
      status: "",
      dateFrom: "",
      dateTo: "",
      ...(groupFilter && !defaultTypeFilter
        ? { types: DOC_TYPE_OPTIONS.filter((t) => t.group === groupFilter).map((t) => t.value).join(",") }
        : {}),
    },
    filterToParam: (key, value) => {
      if (key === "types" && typeFilter) return null; // skip types when specific type is selected
      if (!value) return null;
      return value;
    },
    dependencies: [groupFilter],
  });

  useImperativeHandle(ref, () => ({
    refresh: () => { grid.mutate.refresh(); },
  }));

  const handleTypeChange = (v: string) => {
    const val = v === "all" ? "" : v;
    setTypeFilter(val);
    grid.setFilter("type", val);
    // When specific type selected, clear group types param
    if (val) {
      grid.setFilter("types", "");
    } else if (groupFilter) {
      grid.setFilter("types", DOC_TYPE_OPTIONS.filter((t) => t.group === groupFilter).map((t) => t.value).join(","));
    }
  };

  const handleStatusChange = (v: string) => {
    const val = v === "all" ? "" : v;
    setStatusFilter(val);
    grid.setFilter("status", val);
  };

  const handleDateFromChange = (v: string) => {
    setDateFrom(v);
    grid.setFilter("dateFrom", v);
  };

  const handleDateToChange = (v: string) => {
    setDateTo(v);
    grid.setFilter("dateTo", v);
  };

  const handleConfirm = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Документ подтверждён");
      grid.mutate.refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка подтверждения");
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Документ отменён");
      grid.mutate.refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отмены");
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return;
    setBulkConfirming(true);
    try {
      const res = await csrfFetch("/api/accounting/documents/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      const result = await res.json();
      toast.success(`Подтверждено: ${result.confirmed}, пропущено: ${result.skipped}`);
      setSelectedIds(new Set());
      grid.mutate.refresh();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка массового подтверждения");
    } finally {
      setBulkConfirming(false);
    }
  };

  const columns: DataGridColumn<Document>[] = [
    {
      accessorKey: "number",
      header: "Номер",
      size: 120,
      enableSorting: true,
      meta: { canHide: false },
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.number}</span>,
    },
    {
      accessorKey: "typeName",
      header: "Тип",
      size: 180,
      enableSorting: true,
    },
    {
      accessorKey: "date",
      header: "Дата",
      size: 110,
      enableSorting: true,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      id: "warehouse",
      header: "Склад",
      size: 150,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.warehouse?.name || "—"}</span>
      ),
    },
    {
      id: "counterparty",
      header: "Контрагент",
      size: 180,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.counterparty?.name || "—"}</span>
      ),
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
      accessorKey: "status",
      header: "Статус",
      size: 130,
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status] || "outline"}>
          {row.original.statusName}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 100,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/documents/${row.original.id}`}>
            <Button variant="ghost" size="icon" title="Просмотр">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {row.original.status === "draft" && (
            <Button variant="ghost" size="icon" title="Подтвердить" onClick={() => handleConfirm(row.original.id)}>
              <Check className="h-4 w-4 text-green-600" />
            </Button>
          )}
          {row.original.status === "confirmed" && (
            <Button variant="ghost" size="icon" title="Отменить" onClick={() => handleCancel(row.original.id)}>
              <X className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataGrid
      {...grid.gridProps}
      columns={columns}
      emptyMessage="Нет документов"
      persistenceKey={`documents-${groupFilter || "all"}`}
      selection={{
        enabled: true,
        selectedIds,
        onSelectionChange: setSelectedIds,
        getRowId: (row) => (row as Document).id,
      }}
      toolbar={{
        ...grid.gridProps.toolbar,
        search: {
          value: grid.search,
          onChange: grid.setSearch,
          placeholder: "Поиск по номеру...",
        },
        bulkActions: () => (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkConfirm}
            disabled={bulkConfirming}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Подтвердить выбранные
          </Button>
        ),
        filters: mounted ? (
          <>
            <Select value={typeFilter || "all"} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Тип документа" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {filteredTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={statusFilter || "all"} onValueChange={handleStatusChange}>
              <TabsList>
                <TabsTrigger value="all">Все</TabsTrigger>
                <TabsTrigger value="draft">Черновики</TabsTrigger>
                <TabsTrigger value="confirmed">Подтверждённые</TabsTrigger>
                <TabsTrigger value="cancelled">Отменённые</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="w-36 h-8 text-sm"
                placeholder="Дата с"
                title="Дата с"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="w-36 h-8 text-sm"
                placeholder="Дата по"
                title="Дата по"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => { handleDateFromChange(""); handleDateToChange(""); }}
                >
                  ×
                </Button>
              )}
            </div>
          </>
        ) : null,
      }}
    />
  );
});
DocumentsTable.displayName = "DocumentsTable";

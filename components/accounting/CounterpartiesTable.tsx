/**
 * Counterparties Table
 *
 * Displays counterparties in a data grid with search, filter, and balance display.
 *
 * Migration Status: Tier 1
 * - Feature flag: TABLE_SYSTEM_V1.tables.counterpartiesTable
 * - Preset: counterpartyPreset
 * - Maturity Level: Level 1+ (columns + balance + onRowClick parity)
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { ExternalLink } from "lucide-react";
import { formatRub } from "@/lib/shared/utils";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { useRouter } from "next/navigation";
import { usePresetTable } from "@/lib/table-system/feature-flags";
import { PresetCounterpartiesTable } from "./PresetCounterpartiesTable";

export interface Counterparty {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
  balance: { balanceRub: number } | null;
}

export const TYPE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель/Поставщик",
};

interface CounterpartiesTableProps {
  onCounterpartySelect?: (counterparty: Counterparty) => void;
}

/**
 * Legacy counterparties table implementation.
 * Uses inline column definitions.
 */
function LegacyCounterpartiesTable({ onCounterpartySelect }: CounterpartiesTableProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  // Fix hydration mismatch: only render Select after mount
  // Radix UI generates different IDs on server vs client
  useEffect(() => {
    setMounted(true);
  }, []);

  const grid = useDataGrid<Counterparty>({
    endpoint: "/api/accounting/counterparties",
    pageSize: 25,
    enablePagination: true,
    enableSearch: true,
    sortable: true,
    defaultSort: { field: "name", order: "asc" },
    enablePageSizeChange: true,
    pageSizeOptions: [10, 25, 50, 100],
    defaultFilters: { type: "" },
    filterToParam: (key, value) => {
      if (!value) return null;
      return value;
    },
  });

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    grid.setFilter("type", value === "all" ? "" : value);
  };

  const columns: DataGridColumn<Counterparty>[] = [
    {
      accessorKey: "name",
      header: "Название",
      size: 220,
      enableSorting: true,
      meta: { canHide: false },
      cell: ({ row }) => (
        <span className="font-medium hover:underline cursor-pointer">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Тип",
      size: 160,
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant="outline">{TYPE_LABELS[row.original.type] || row.original.type}</Badge>
      ),
    },
    {
      accessorKey: "inn",
      header: "ИНН",
      size: 140,
      enableSorting: true,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.inn || "—"}</span>,
    },
    {
      accessorKey: "phone",
      header: "Телефон",
      size: 150,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      id: "balance",
      header: "Баланс",
      size: 140,
      enableSorting: true,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const b = row.original.balance;
        if (!b) return <span className="text-muted-foreground">0</span>;
        return (
          <span className={b.balanceRub >= 0 ? "text-green-600" : "text-red-600"}>
            {formatRub(b.balanceRub)}
          </span>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      size: 110,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? "Активен" : "Неактивен"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 50,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          title="Открыть карточку"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/counterparties/${row.original.id}`);
          }}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const handleRowClick = (row: Counterparty) => {
    if (onCounterpartySelect) {
      onCounterpartySelect(row);
    } else {
      router.push(`/counterparties/${row.id}`);
    }
  };

  return (
    <DataGrid
      {...grid.gridProps}
      columns={columns}
      emptyMessage={grid.search ? "Ничего не найдено" : "Нет контрагентов"}
      persistenceKey="counterparties"
      onRowClick={handleRowClick}
      getRowClassName={() => "cursor-pointer"}
      toolbar={{
        ...grid.gridProps.toolbar,
        search: {
          value: grid.search,
          onChange: grid.setSearch,
          placeholder: "Поиск по названию, ИНН, телефону...",
        },
        filters: mounted ? (
          <Select value={typeFilter} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все контрагенты</SelectItem>
              <SelectItem value="customer">Покупатели</SelectItem>
              <SelectItem value="supplier">Поставщики</SelectItem>
              <SelectItem value="both">Покупатель/Поставщик</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="w-48 h-9 border rounded-md bg-muted/50" />
        ),
        actions: (
          <Button onClick={() => router.push("/counterparties/new")}>
            Добавить
          </Button>
        ),
      }}
    />
  );
}

/**
 * Counterparties table with feature flag switch.
 *
 * When TABLE_SYSTEM_V1.tables.counterpartiesTable is true:
 * - Uses PresetCounterpartiesTable (preset-driven)
 *
 * When false:
 * - Uses LegacyCounterpartiesTable (inline columns)
 */
export function CounterpartiesTable(props: CounterpartiesTableProps) {
  const usePreset = usePresetTable("counterpartiesTable");

  if (usePreset) {
    return <PresetCounterpartiesTable {...props} />;
  }

  return <LegacyCounterpartiesTable {...props} />;
}

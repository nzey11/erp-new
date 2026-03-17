/**
 * Preset-driven Counterparties Table
 *
 * DataGrid-based implementation using counterparty-preset.
 * Level 1+ migration: columns + balance renderer + onRowClick parity.
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { ExternalLink } from "lucide-react";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { useRouter } from "next/navigation";
import { adaptPreset } from "@/components/ui/data-grid/preset-adapter";
import { counterpartyPreset } from "@/lib/table-system/presets";
import type { CounterpartyTableRow } from "@/lib/table-system/presets/counterparty-preset";

interface PresetCounterpartiesTableProps {
  onCounterpartySelect?: (counterparty: CounterpartyTableRow) => void;
}

/**
 * Counterparties table using preset system.
 *
 * Uses:
 * - counterpartyPreset for column definitions
 * - preset-adapter for DataGrid transformation
 * - money renderer with colorBySign for balance
 * - onRowClick for navigation
 */
export function PresetCounterpartiesTable({ onCounterpartySelect }: PresetCounterpartiesTableProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  // Fix hydration mismatch: only render after mount
  // Radix UI generates different IDs on server vs client
  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const grid = useDataGrid<CounterpartyTableRow>({
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

  // Adapt preset columns
  const adapted = adaptPreset(counterpartyPreset);

  // Add actions column via column override (Level 1 compromise)
  const columnsWithActions: DataGridColumn<CounterpartyTableRow>[] = [
    ...adapted.columns,
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

  const handleRowClick = (row: CounterpartyTableRow) => {
    if (onCounterpartySelect) {
      onCounterpartySelect(row);
    } else {
      router.push(`/counterparties/${row.id}`);
    }
  };

  return (
    <DataGrid
      {...grid.gridProps}
      columns={columnsWithActions}
      emptyMessage={grid.search ? "Ничего не найдено" : "Нет контрагентов"}
      persistenceKey={adapted.persistenceKey}
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

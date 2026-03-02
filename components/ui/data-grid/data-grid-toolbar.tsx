"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Search, Settings2 } from "lucide-react";
import type { Table as TanStackTable } from "@tanstack/react-table";
import type { DataGridToolbar as ToolbarConfig, DataGridSelection } from "./data-grid-types";

interface DataGridToolbarProps<TData> {
  toolbar: ToolbarConfig;
  table: TanStackTable<TData>;
  selection?: DataGridSelection;
}

export function DataGridToolbar<TData>({ toolbar, table }: DataGridToolbarProps<TData>) {
  const hasColumnVisibility = table.getAllColumns().some((col) => col.columnDef.meta?.canHide !== false && col.id !== "__selection");

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Search */}
        {toolbar.search && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={toolbar.search.placeholder ?? "Поиск..."}
              value={toolbar.search.value}
              onChange={(e) => toolbar.search!.onChange(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {/* Custom Filters */}
        {toolbar.filters}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Custom Actions */}
        {toolbar.actions}

        {/* Column Visibility */}
        {hasColumnVisibility && (
          <ColumnVisibilityMenu table={table} />
        )}
      </div>
    </div>
  );
}

function ColumnVisibilityMenu<TData>({ table }: { table: TanStackTable<TData> }) {
  const columns = table.getAllColumns().filter(
    (col) => col.id !== "__selection" && col.columnDef.meta?.canHide !== false
  );

  if (columns.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Настройка колонок">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Показать колонки</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(checked)}
          >
            {typeof column.columnDef.header === "string"
              ? column.columnDef.header
              : column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

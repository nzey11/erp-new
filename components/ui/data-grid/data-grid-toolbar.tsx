"use client";

import { useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dropdown, Checkbox } from "antd";
import type { MenuProps } from "antd";
import { Search, Settings2, X } from "lucide-react";
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
              className="pl-10 pr-8"
            />
            {toolbar.search.value && (
              <button
                type="button"
                onClick={() => toolbar.search!.onChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (columns.length === 0) return null;

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" title="Настройка колонок" disabled>
        <Settings2 className="h-4 w-4" />
      </Button>
    );
  }

  const items: MenuProps["items"] = [
    {
      key: "label",
      label: "Показать колонки",
      disabled: true,
    },
    { type: "divider" },
    ...columns.map((column) => {
      // Resolve display name: meta.label > string header > column id
      const meta = column.columnDef.meta;
      const header = column.columnDef.header;
      const displayName =
        meta?.label ??
        (typeof header === "string" ? header : undefined) ??
        column.id;

      return {
        key: column.id,
        label: (
          <Checkbox
            checked={column.getIsVisible()}
            onChange={(e) => column.toggleVisibility(e.target.checked)}
          >
            {displayName}
          </Checkbox>
        ),
      };
    }),
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <Button variant="outline" size="icon" title="Настройка колонок">
        <Settings2 className="h-4 w-4" />
      </Button>
    </Dropdown>
  );
}

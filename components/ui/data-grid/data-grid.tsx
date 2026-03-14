"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
  type ColumnSizingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { cn } from "@/lib/shared/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { DataGridToolbar } from "./data-grid-toolbar";
import { DataGridPaginationBar } from "./data-grid-pagination";
import { DataGridBulkBar } from "./data-grid-bulk-bar";
import { DataGridCell } from "./data-grid-cell";
import {
  loadColumnSizing,
  saveColumnSizing,
  loadColumnVisibility,
  saveColumnVisibility,
} from "./data-grid-persist";
import type { DataGridProps } from "./data-grid-types";

export function DataGrid<TData>({
  data,
  columns,
  pagination,
  selection,
  toolbar,
  persistenceKey,
  density = "compact",
  stickyHeader = true,
  loading = false,
  emptyMessage = "Нет данных",
  footer,
  onRowClick,
  getRowClassName,
  onSortingChange,
  sorting: externalSorting,
}: DataGridProps<TData>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);

  // SSR safety: track mounted state to avoid hydration mismatch
  // Persistence values differ between server (empty) and client (localStorage)
  const [mounted, setMounted] = useState(false);

  // State
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const sorting = externalSorting ?? internalSorting;

  // Initialize with empty state for SSR consistency
  // Load persisted values after mount to avoid hydration mismatch
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Load persisted state after mount (client-only)
  useEffect(() => {
    if (persistenceKey) {
      const savedSizing = loadColumnSizing(persistenceKey);
      const savedVisibility = loadColumnVisibility(persistenceKey);
      if (Object.keys(savedSizing).length > 0) {
        setColumnSizing(savedSizing);
      }
      if (Object.keys(savedVisibility).length > 0) {
        setColumnVisibility(savedVisibility);
      }
    }
    setMounted(true);
  }, [persistenceKey]);

  // Persist column sizing (debounced)
  const sizingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        if (persistenceKey) {
          clearTimeout(sizingTimeoutRef.current);
          sizingTimeoutRef.current = setTimeout(() => saveColumnSizing(persistenceKey, next), 300);
        }
        return next;
      });
    },
    [persistenceKey]
  );

  // Persist column visibility
  const handleColumnVisibilityChange = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setColumnVisibility((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        if (persistenceKey) saveColumnVisibility(persistenceKey, next);
        return next;
      });
    },
    [persistenceKey]
  );

  // Build selection column
  const selectionColumn = selection?.enabled
    ? {
        id: "__selection",
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableResizing: false,
        enableSorting: false,
        header: () => {
          const allSelected = data.length > 0 && data.every((row) => selection.selectedIds.has(selection.getRowId(row)));
          const someSelected = data.some((row) => selection.selectedIds.has(selection.getRowId(row)));
          return (
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={() => {
                if (allSelected) {
                  selection.onSelectionChange(new Set());
                } else {
                  selection.onSelectionChange(new Set(data.map((row) => selection.getRowId(row))));
                }
              }}
              aria-label="Выбрать все"
            />
          );
        },
        cell: ({ row }: { row: { original: TData } }) => {
          const rowId = selection.getRowId(row.original);
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selection.selectedIds.has(rowId)}
                onCheckedChange={() => {
                  const next = new Set(selection.selectedIds);
                  if (next.has(rowId)) next.delete(rowId);
                  else next.add(rowId);
                  selection.onSelectionChange(next);
                }}
                aria-label="Выбрать"
              />
            </div>
          );
        },
      }
    : null;

  const allColumns = selectionColumn
    ? [selectionColumn as typeof columns[number], ...columns]
    : columns;

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      columnSizing,
      columnVisibility,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (onSortingChange && next.length > 0) {
        onSortingChange(next[0].id, next[0].desc ? "desc" : "asc");
      }
      if (!externalSorting) setInternalSorting(next);
    },
    onColumnSizingChange: handleColumnSizingChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    manualSorting: !!onSortingChange,
  });

  // Scroll detection for sticky header shadow
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stickyHeader) return;
    const handleScroll = () => setIsScrolled(container.scrollTop > 0);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [stickyHeader]);

  const densityClass = density === "compact"
    ? "[&_td]:py-1 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2 text-[13px]"
    : "[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3 text-sm";

  const visibleColumnCount = table.getVisibleFlatColumns().length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {toolbar && (
        <DataGridToolbar
          toolbar={toolbar}
          table={table}
          selection={selection}
        />
      )}

      {/* Bulk Actions Bar */}
      {selection?.enabled && selection.selectedIds.size > 0 && toolbar?.bulkActions && (
        <DataGridBulkBar
          selectedCount={selection.selectedIds.size}
          onClear={() => selection.onSelectionChange(new Set())}
        >
          {toolbar.bulkActions(selection.selectedIds.size)}
        </DataGridBulkBar>
      )}

      {/* Table Container */}
      <div
        ref={containerRef}
        className={cn(
          "border rounded-lg overflow-auto relative",
          stickyHeader && "max-h-[calc(100vh-280px)]",
          densityClass
        )}
      >
        <table className="w-full caption-bottom border-collapse" style={{ minWidth: table.getTotalSize() }}>
          {/* Header */}
          <thead
            className={cn(
              stickyHeader && "sticky top-0 z-10 bg-background",
              isScrolled && "shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
              "[&_tr]:border-b"
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const align = meta?.align ?? "left";
                  const isPinned = meta?.pin === "left";
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "relative select-none whitespace-nowrap font-medium text-foreground align-middle",
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        isPinned && "sticky left-0 z-20 bg-background",
                        header.column.getCanSort() && "cursor-pointer hover:bg-muted/50"
                      )}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === "asc"
                            ? <ArrowUp className="h-3.5 w-3.5 shrink-0 text-foreground" />
                            : header.column.getIsSorted() === "desc"
                              ? <ArrowDown className="h-3.5 w-3.5 shrink-0 text-foreground" />
                              : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                      </div>
                      {/* Resize Handle */}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className={cn(
                            "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                            "hover:bg-primary/40 active:bg-primary/60",
                            header.column.getIsResizing() && "bg-primary/60"
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody className="[&_tr:last-child]:border-0">
            {loading ? (
              [...Array(pagination?.pageSize ?? 8)].map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b">
                  {table.getVisibleFlatColumns().map((col) => (
                    <td key={col.id} className="align-middle">
                      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="text-center text-muted-foreground py-12">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const rowId = selection?.getRowId(row.original) ?? row.id;
                const isSelected = selection?.selectedIds.has(rowId);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b transition-colors",
                      "hover:bg-muted/50",
                      isSelected && "bg-accent/30",
                      onRowClick && "cursor-pointer",
                      getRowClassName?.(row.original)
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const align = meta?.align ?? "left";
                      const isPinned = meta?.pin === "left";
                      const editable = meta?.editable;
                      const isEditing =
                        editingCell?.rowId === rowId && editingCell?.columnId === cell.column.id;

                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "align-middle whitespace-nowrap",
                            align === "right" && "text-right",
                            align === "center" && "text-center",
                            isPinned && "sticky left-0 z-[5] bg-background",
                            editable && !isEditing && "cursor-pointer hover:bg-muted/30"
                          )}
                          style={{ width: cell.column.getSize() }}
                          onClick={
                            editable && !isEditing
                              ? (e) => {
                                  e.stopPropagation();
                                  setEditingCell({ rowId, columnId: cell.column.id });
                                }
                              : undefined
                          }
                        >
                          {editable && isEditing ? (
                            <DataGridCell
                              value={cell.getValue()}
                              editable={editable}
                              rowId={rowId}
                              onClose={() => setEditingCell(null)}
                            />
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer */}
          {footer && data.length > 0 && (
            <tfoot className="bg-muted/50 border-t font-medium [&>tr]:last:border-b-0">
              {footer}
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <DataGridPaginationBar
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          pageSizeOptions={pagination.pageSizeOptions}
        />
      )}
    </div>
  );
}

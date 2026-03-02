import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

// Extend TanStack's column meta for our custom properties
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "center" | "right";
    canHide?: boolean;
    pin?: "left" | "right";
    editable?: EditableConfig;
  }
}

export interface EditableConfig {
  type: "text" | "number" | "select";
  onSave: (rowId: string, value: unknown) => Promise<void>;
  validate?: (value: unknown) => boolean | string;
  options?: Array<{ value: string; label: string }>;
}

export type DataGridColumn<TData> = ColumnDef<TData, unknown>;

export type Density = "compact" | "normal";

export interface DataGridPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataGridSelection {
  enabled: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  getRowId: (row: unknown) => string;
}

export interface DataGridToolbar {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: ReactNode;
  actions?: ReactNode;
  bulkActions?: (selectedCount: number) => ReactNode;
}

export interface DataGridProps<TData> {
  data: TData[];
  columns: DataGridColumn<TData>[];
  pagination?: DataGridPagination;
  selection?: DataGridSelection;
  toolbar?: DataGridToolbar;
  persistenceKey?: string;
  density?: Density;
  stickyHeader?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  footer?: ReactNode;
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: TData) => string;
  onSortingChange?: (sortBy: string, sortOrder: "asc" | "desc") => void;
  sorting?: { id: string; desc: boolean }[];
}

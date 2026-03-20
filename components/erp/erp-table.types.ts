import type { ReactNode } from "react";

/**
 * Framework-agnostic column definition for ERP tables.
 * No imports from antd — this is the contract boundary.
 */
export interface ERPColumn<T> {
  /** Unique key for the column */
  key: string;

  /** Column header content */
  title: ReactNode;

  /** Data path — can be keyof T for simple fields or dot-notation string for nested */
  dataIndex?: keyof T | string;

  /** Column width in pixels or CSS value */
  width?: number | string;

  /** Text alignment */
  align?: "left" | "center" | "right";

  /** Fixed column position */
  fixed?: "left" | "right";

  /** Whether column is hidden by default */
  hidden?: boolean;

  /** Whether column is sortable */
  sortable?: boolean;

  /** Custom cell renderer — receives value, row data, and row index */
  render?: (value: unknown, row: T, index: number) => ReactNode;

  /** Additional CSS class for cells */
  className?: string;

  /** Whether to show ellipsis for overflow */
  ellipsis?: boolean;
}

/**
 * Pagination state for ERP tables.
 */
export interface ERPPagination {
  current: number;
  pageSize: number;
  total: number;
}

/**
 * Selection state and callbacks for ERP tables.
 */
export interface ERPSelection<T> {
  /** Currently selected row keys */
  selectedRowKeys: React.Key[];

  /** Callback when selection changes */
  onChange: (keys: React.Key[], rows: T[]) => void;

  /** Function to extract unique key from row data */
  getRowKey: (row: T) => React.Key;

  /** Whether to preserve selected rows when pagination changes */
  preserveSelectedRowKeys?: boolean;

  /** Width of the selection column (checkbox/radio) */
  columnWidth?: number;
}

/**
 * Sorting state for ERP tables.
 */
export interface ERPSorting {
  field?: string;
  order?: "ascend" | "descend" | null;
}

/**
 * Props for the ERPTable component.
 * Stateless presentation component — no fetching, no domain logic.
 */
export interface ERPTableProps<T> {
  /** Table data */
  data: T[];

  /** Column definitions */
  columns: ERPColumn<T>[];

  /** Loading state */
  loading?: boolean;

  /** Pagination configuration */
  pagination?: ERPPagination;

  /** Selection configuration */
  selection?: ERPSelection<T>;

  /** Row click handler */
  onRowClick?: (row: T) => void;

  /**
   * Row actions renderer — returns ReactNode for the actions column.
   * Page layer decides what to render (Dropdown, buttons, etc.)
   */
  rowActions?: (row: T) => ReactNode;

  /** Empty state content */
  emptyText?: ReactNode;

  /** Whether to use sticky header */
  sticky?: boolean;

  /** Table size variant */
  size?: "small" | "middle" | "large";

  /** Row class name generator */
  rowClassName?: (row: T, index: number) => string;

  /**
   * Table change callback — normalized ERP format.
   * NOT raw antd Table.onChange payload.
   */
  onChange?: (params: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: "ascend" | "descend" | null;
  }) => void;

  /** Unique key for row identification */
  rowKey?: string | ((row: T) => React.Key);

  /** Refresh callback — shows refresh button when provided */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Props for the ERPToolbar component.
 * Presentation-only — no domain logic.
 */
export interface ERPToolbarProps {
  /** Create button click handler */
  onCreateClick?: () => void;

  /** Label for the create button */
  createLabel?: string;

  /** Bulk actions slot — rendered when rows are selected */
  bulkActions?: ReactNode;

  /** Extra actions slot — rendered on the right side */
  extraActions?: ReactNode;

  /** Number of selected rows — triggers bulk mode when > 0 */
  selectedCount?: number;
}

/**
 * Props for ERPPage layout component.
 */
export interface ERPPageProps {
  /** Page header content */
  header?: ReactNode;

  /** Filters section */
  filters?: ReactNode;

  /** Toolbar section */
  toolbar?: ReactNode;

  /** Table/content section */
  children: ReactNode;

  /** Optional summary/footer section */
  summary?: ReactNode;
}

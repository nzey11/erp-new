export interface UseDataGridConfig<TData> {
  /** API endpoint, e.g. "/api/accounting/products" */
  endpoint: string;
  /** Items per page (default: 50) */
  pageSize?: number;
  /** Cache namespace key */
  persistenceKey?: string;

  // Features
  enablePagination?: boolean;   // default: true
  enableSearch?: boolean;       // default: true
  searchDebounce?: number;      // default: 300
  sortable?: boolean;           // default: false
  defaultSort?: { field: string; order: "asc" | "desc" };
  /** Allow user to change page size in the pagination bar. Default: false */
  enablePageSizeChange?: boolean;
  /** Available page-size choices shown in the selector. Default: [10, 25, 50, 100] */
  pageSizeOptions?: number[];
  /** Sync state to URL query params. Disable for embedded/child components. Default: true */
  syncUrl?: boolean;

  // Filters
  defaultFilters?: Record<string, string>;
  /** Transform filter value before adding to URLSearchParams. Return null to skip. */
  filterToParam?: (key: string, value: string) => string | null;

  // Response parsing
  responseAdapter?: (json: unknown) => { data: TData[]; total: number };

  // External triggers that force refetch
  dependencies?: unknown[];
}

export interface UseDataGridReturn<TData> {
  // Data
  data: TData[];
  total: number;
  loading: boolean;

  // State controls
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  search: string;
  setSearch: (s: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  setFilters: (f: Record<string, string>) => void;
  resetFilters: () => void;
  sort: { field: string; order: "asc" | "desc" } | null;
  setSort: (field: string, order: "asc" | "desc") => void;

  // Mutations
  mutate: {
    delete: (id: string) => Promise<void>;
    update: (id: string, data: Partial<TData>) => Promise<void>;
    create: (data: unknown) => Promise<TData>;
    refresh: () => Promise<void>;
  };

  // Legacy gridProps for backward compatibility with existing code
  gridProps: {
    data: TData[];
    loading: boolean;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      onPageChange: (page: number) => void;
      onPageSizeChange?: (size: number) => void;
      pageSizeOptions?: number[];
    };
    toolbar: {
      search?: { value: string; onChange: (value: string) => void };
    };
    sorting?: { id: string; desc: boolean }[];
    onSortingChange?: (sortBy: string, sortOrder: "asc" | "desc") => void;
  };
}

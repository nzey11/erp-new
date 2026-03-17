/**
 * Stock document filters — typed contract for URL-driven filtering on stock document tabs.
 * Supports: inventory_count, write_off, stock_receipt, stock_transfer.
 */

export interface StockDocumentFilters {
  /** Search query — document number */
  search?: string;

  /** Document type filter (e.g. "inventory_count", "write_off") */
  type?: string;

  /** Status filter: draft | confirmed | cancelled */
  status?: string;

  /** Date range start (ISO date string YYYY-MM-DD) */
  dateFrom?: string;

  /** Date range end (ISO date string YYYY-MM-DD) */
  dateTo?: string;

  /** Warehouse ID filter */
  warehouseId?: string;

  /** Current page (1-based) */
  page?: number;

  /** Page size */
  pageSize?: number;

  /** Sort field */
  sort?: string;

  /** Sort order */
  order?: "asc" | "desc";
}

/**
 * Default filter values.
 */
export const defaultStockDocumentFilters: StockDocumentFilters = {
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

/**
 * Parse URL search params into typed StockDocumentFilters.
 */
export function parseStockDocumentFilters(searchParams: URLSearchParams): StockDocumentFilters {
  const filters: StockDocumentFilters = {
    page: defaultStockDocumentFilters.page,
    pageSize: defaultStockDocumentFilters.pageSize,
    sort: defaultStockDocumentFilters.sort,
    order: defaultStockDocumentFilters.order,
  };

  const search = searchParams.get("search");
  if (search) filters.search = search;

  const type = searchParams.get("type");
  if (type) filters.type = type;

  const status = searchParams.get("status");
  if (status) filters.status = status;

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const warehouseId = searchParams.get("warehouseId");
  if (warehouseId) filters.warehouseId = warehouseId;

  const page = searchParams.get("page");
  if (page) {
    const parsed = parseInt(page, 10);
    if (!isNaN(parsed) && parsed > 0) filters.page = parsed;
  }

  const pageSize = searchParams.get("pageSize");
  if (pageSize) {
    const parsed = parseInt(pageSize, 10);
    if (!isNaN(parsed) && parsed > 0) filters.pageSize = parsed;
  }

  const sort = searchParams.get("sort");
  if (sort) filters.sort = sort;

  const order = searchParams.get("order");
  if (order === "asc" || order === "desc") filters.order = order;

  return filters;
}

/**
 * Serialize StockDocumentFilters back to URLSearchParams.
 * Empty/undefined values are omitted for clean URLs.
 */
export function serializeStockDocumentFilters(
  filters: StockDocumentFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  // Clear all known filter keys
  [
    "search", "type", "status", "dateFrom", "dateTo", "warehouseId",
    "page", "pageSize", "sort", "order",
  ].forEach((key) => params.delete(key));

  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);

  params.set("page", String(filters.page ?? defaultStockDocumentFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultStockDocumentFilters.pageSize));

  if (filters.sort && filters.sort !== defaultStockDocumentFilters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.order && filters.order !== defaultStockDocumentFilters.order) {
    params.set("order", filters.order);
  }

  return params;
}

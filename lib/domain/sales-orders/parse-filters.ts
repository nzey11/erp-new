/**
 * Sales order filters — typed contract for URL-driven filtering on the sales_order tab.
 * Covers EcomStatus, paymentStatus, source (ecom/manual), and date range.
 */

export interface SalesOrderFilters {
  /** Search query — document number */
  search?: string;

  /** EcomStatus filter: pending | paid | processing | shipped | delivered | cancelled */
  status?: string;

  /** Payment status filter: pending | paid | failed | refunded */
  paymentStatus?: string;

  /** Source filter: all | ecom | manual */
  source?: "all" | "ecom" | "manual";

  /** Date range start (ISO date string YYYY-MM-DD) */
  dateFrom?: string;

  /** Date range end (ISO date string YYYY-MM-DD) */
  dateTo?: string;

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
export const defaultSalesOrderFilters: SalesOrderFilters = {
  source: "all",
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

/**
 * Parse URL search params into typed SalesOrderFilters.
 */
export function parseSalesOrderFilters(searchParams: URLSearchParams): SalesOrderFilters {
  const filters: SalesOrderFilters = {
    source: defaultSalesOrderFilters.source,
    page: defaultSalesOrderFilters.page,
    pageSize: defaultSalesOrderFilters.pageSize,
    sort: defaultSalesOrderFilters.sort,
    order: defaultSalesOrderFilters.order,
  };

  const search = searchParams.get("search");
  if (search) filters.search = search;

  const status = searchParams.get("status");
  if (status) filters.status = status;

  const paymentStatus = searchParams.get("paymentStatus");
  if (paymentStatus) filters.paymentStatus = paymentStatus;

  const source = searchParams.get("source");
  if (source === "ecom" || source === "manual") {
    filters.source = source;
  }

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

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
 * Serialize SalesOrderFilters back to URLSearchParams.
 * Empty/undefined values are omitted for clean URLs.
 */
export function serializeSalesOrderFilters(
  filters: SalesOrderFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  // Clear all known filter keys
  [
    "search", "status", "paymentStatus", "source",
    "dateFrom", "dateTo", "page", "pageSize", "sort", "order",
  ].forEach((key) => params.delete(key));

  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.source && filters.source !== "all") params.set("source", filters.source);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  params.set("page", String(filters.page ?? defaultSalesOrderFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultSalesOrderFilters.pageSize));

  if (filters.sort && filters.sort !== defaultSalesOrderFilters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.order && filters.order !== defaultSalesOrderFilters.order) {
    params.set("order", filters.order);
  }

  return params;
}

/**
 * Document filters — typed contract for URL-driven filtering on the generic documents page.
 * Supports all 12 document types across all groups.
 */

export interface DocumentFilters {
  /** Search query — document number */
  search?: string;

  /** Document type filter (e.g. "stock_receipt", "purchase_order") */
  type?: string;

  /** Document group filter: stock | purchases | sales | finance | "" */
  group?: string;

  /** Status filter: draft | confirmed | cancelled */
  status?: string;

  /** Date range start (ISO date string YYYY-MM-DD) */
  dateFrom?: string;

  /** Date range end (ISO date string YYYY-MM-DD) */
  dateTo?: string;

  /** Counterparty ID filter */
  counterpartyId?: string;

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
export const defaultDocumentFilters: DocumentFilters = {
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

/**
 * Parse URL search params into typed DocumentFilters.
 */
export function parseDocumentFilters(searchParams: URLSearchParams): DocumentFilters {
  const filters: DocumentFilters = {
    page: defaultDocumentFilters.page,
    pageSize: defaultDocumentFilters.pageSize,
    sort: defaultDocumentFilters.sort,
    order: defaultDocumentFilters.order,
  };

  const search = searchParams.get("search");
  if (search) filters.search = search;

  const type = searchParams.get("type");
  if (type) filters.type = type;

  const group = searchParams.get("group");
  if (group) filters.group = group;

  const status = searchParams.get("status");
  if (status) filters.status = status;

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const counterpartyId = searchParams.get("counterpartyId");
  if (counterpartyId) filters.counterpartyId = counterpartyId;

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
 * Serialize DocumentFilters back to URLSearchParams.
 * Empty/undefined values are omitted for clean URLs.
 */
export function serializeDocumentFilters(
  filters: DocumentFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  // Clear all known filter keys
  [
    "search", "type", "group", "status",
    "dateFrom", "dateTo", "counterpartyId", "warehouseId",
    "page", "pageSize", "sort", "order",
  ].forEach((key) => params.delete(key));

  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.group) params.set("group", filters.group);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.counterpartyId) params.set("counterpartyId", filters.counterpartyId);
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);

  params.set("page", String(filters.page ?? defaultDocumentFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultDocumentFilters.pageSize));

  if (filters.sort && filters.sort !== defaultDocumentFilters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.order && filters.order !== defaultDocumentFilters.order) {
    params.set("order", filters.order);
  }

  return params;
}

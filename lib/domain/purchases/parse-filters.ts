/**
 * Purchase document filters — typed contract for URL-driven filtering.
 * This is the source of truth for all filter-related logic in the purchases module.
 */

export interface PurchaseFilters {
  /** Search query — document number */
  search?: string;

  /** Document type filter */
  type?: string;

  /** Status filter: draft | confirmed | cancelled */
  status?: string;

  /** Date range start (ISO date string) */
  dateFrom?: string;

  /** Date range end (ISO date string) */
  dateTo?: string;

  /** Counterparty ID filter */
  counterpartyId?: string;

  /** Current page */
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
export const defaultPurchaseFilters: PurchaseFilters = {
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

/**
 * Parse URL search params into typed PurchaseFilters.
 * This is the single entry point for filter parsing.
 */
export function parseFilters(searchParams: URLSearchParams): PurchaseFilters {
  const filters: PurchaseFilters = {
    page: defaultPurchaseFilters.page,
    pageSize: defaultPurchaseFilters.pageSize,
    sort: defaultPurchaseFilters.sort,
    order: defaultPurchaseFilters.order,
  };

  const search = searchParams.get("search");
  if (search) {
    filters.search = search;
  }

  const type = searchParams.get("type");
  if (type) {
    filters.type = type;
  }

  const status = searchParams.get("status");
  if (status) {
    filters.status = status;
  }

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) {
    filters.dateFrom = dateFrom;
  }

  const dateTo = searchParams.get("dateTo");
  if (dateTo) {
    filters.dateTo = dateTo;
  }

  const counterpartyId = searchParams.get("counterpartyId");
  if (counterpartyId) {
    filters.counterpartyId = counterpartyId;
  }

  const page = searchParams.get("page");
  if (page) {
    const parsed = parseInt(page, 10);
    if (!isNaN(parsed) && parsed > 0) {
      filters.page = parsed;
    }
  }

  const pageSize = searchParams.get("pageSize");
  if (pageSize) {
    const parsed = parseInt(pageSize, 10);
    if (!isNaN(parsed) && parsed > 0) {
      filters.pageSize = parsed;
    }
  }

  const sort = searchParams.get("sort");
  if (sort) {
    filters.sort = sort;
  }

  const order = searchParams.get("order");
  if (order === "asc" || order === "desc") {
    filters.order = order;
  }

  return filters;
}

/**
 * Serialize PurchaseFilters back to URLSearchParams.
 * Used when updating filters via UI.
 */
export function serializeFilters(
  filters: PurchaseFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  // Clear existing filter params
  [
    "search",
    "type",
    "status",
    "dateFrom",
    "dateTo",
    "counterpartyId",
    "page",
    "pageSize",
    "sort",
    "order",
  ].forEach((key) => params.delete(key));

  // Set new values
  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  if (filters.counterpartyId) {
    params.set("counterpartyId", filters.counterpartyId);
  }

  // Always include pagination
  params.set("page", String(filters.page ?? defaultPurchaseFilters.page));
  params.set(
    "pageSize",
    String(filters.pageSize ?? defaultPurchaseFilters.pageSize)
  );

  if (filters.sort && filters.sort !== defaultPurchaseFilters.sort) {
    params.set("sort", filters.sort);
  }

  if (filters.order && filters.order !== defaultPurchaseFilters.order) {
    params.set("order", filters.order);
  }

  return params;
}

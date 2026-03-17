/**
 * Counterparty filters — typed contract for URL-driven filtering.
 * This is the source of truth for all filter-related logic in counterparties module.
 */

export type CounterpartyType = "customer" | "supplier" | "both";

export interface CounterpartyFilters {
  /** Search query (name, inn, phone, email) */
  search?: string;

  /** Counterparty type filter */
  type?: CounterpartyType;

  /** Active status filter */
  isActive?: boolean;

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
export const defaultCounterpartyFilters: CounterpartyFilters = {
  page: 1,
  pageSize: 25,
  sort: "name",
  order: "asc",
};

/**
 * Parse URL search params into typed CounterpartyFilters.
 * This is the single entry point for filter parsing.
 */
export function parseCounterpartyFilters(
  searchParams: URLSearchParams
): CounterpartyFilters {
  const filters: CounterpartyFilters = {
    page: defaultCounterpartyFilters.page,
    pageSize: defaultCounterpartyFilters.pageSize,
    sort: defaultCounterpartyFilters.sort,
    order: defaultCounterpartyFilters.order,
  };

  const search = searchParams.get("search");
  if (search) {
    filters.search = search;
  }

  const type = searchParams.get("type");
  if (type === "customer" || type === "supplier" || type === "both") {
    filters.type = type;
  }

  const isActive = searchParams.get("isActive");
  if (isActive === "true") {
    filters.isActive = true;
  } else if (isActive === "false") {
    filters.isActive = false;
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
 * Serialize CounterpartyFilters back to URLSearchParams.
 * Used when updating filters via UI.
 */
export function serializeCounterpartyFilters(
  filters: CounterpartyFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams ? new URLSearchParams(baseParams) : new URLSearchParams();

  // Clear existing filter params
  [
    "search",
    "type",
    "isActive",
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

  if (filters.isActive !== undefined) {
    params.set("isActive", String(filters.isActive));
  }

  // Always include pagination and sorting
  params.set("page", String(filters.page ?? defaultCounterpartyFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultCounterpartyFilters.pageSize));
  params.set("sort", filters.sort ?? String(defaultCounterpartyFilters.sort));
  params.set("order", filters.order ?? String(defaultCounterpartyFilters.order));

  return params;
}

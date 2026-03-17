/**
 * Stock balance filters — typed contract for URL-driven filtering.
 * This is the source of truth for all filter-related logic in the stock balances module.
 */

export interface StockFilters {
  /** Search query — product name or SKU */
  search?: string;

  /** Warehouse ID filter */
  warehouseId?: string;

  /** Current page */
  page?: number;

  /** Page size */
  pageSize?: number;
}

/**
 * Default filter values.
 */
export const defaultStockFilters: StockFilters = {
  page: 1,
  pageSize: 100,
};

/**
 * Parse URL search params into typed StockFilters.
 * This is the single entry point for filter parsing.
 */
export function parseStockFilters(searchParams: URLSearchParams): StockFilters {
  const filters: StockFilters = {
    page: defaultStockFilters.page,
    pageSize: defaultStockFilters.pageSize,
  };

  const search = searchParams.get("search");
  if (search) {
    filters.search = search;
  }

  const warehouseId = searchParams.get("warehouseId");
  if (warehouseId) {
    filters.warehouseId = warehouseId;
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

  return filters;
}

/**
 * Serialize StockFilters back to URLSearchParams.
 * Used when updating filters via UI.
 */
export function serializeStockFilters(
  filters: StockFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  // Clear existing filter params
  ["search", "warehouseId", "page", "pageSize"].forEach((key) =>
    params.delete(key)
  );

  // Set new values
  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.warehouseId) {
    params.set("warehouseId", filters.warehouseId);
  }

  // Always include pagination
  params.set("page", String(filters.page ?? defaultStockFilters.page));
  params.set(
    "pageSize",
    String(filters.pageSize ?? defaultStockFilters.pageSize)
  );

  return params;
}

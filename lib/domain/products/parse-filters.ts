/**
 * Product filters — typed contract for URL-driven filtering.
 * This is the source of truth for all filter-related logic in products module.
 */

export type VariantStatus = "masters" | "variants" | "unlinked";

export interface ProductFilters {
  /** Search query (name, sku, barcode) */
  search?: string;

  /** Category ID filter */
  categoryId?: string;

  /** Active status filter */
  isActive?: boolean;

  /** Published to store filter */
  published?: boolean;

  /** Variant status filter */
  variantStatus?: VariantStatus;

  /** Has discount filter */
  hasDiscount?: boolean;

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
export const defaultProductFilters: ProductFilters = {
  page: 1,
  pageSize: 50,
  sort: "name",
  order: "asc",
};

/**
 * Parse URL search params into typed ProductFilters.
 * This is the single entry point for filter parsing.
 */
export function parseProductFilters(
  searchParams: URLSearchParams
): ProductFilters {
  const filters: ProductFilters = {
    page: defaultProductFilters.page,
    pageSize: defaultProductFilters.pageSize,
    sort: defaultProductFilters.sort,
    order: defaultProductFilters.order,
  };

  const search = searchParams.get("search");
  if (search) {
    filters.search = search;
  }

  const categoryId = searchParams.get("categoryId");
  if (categoryId) {
    filters.categoryId = categoryId;
  }

  const isActive = searchParams.get("isActive");
  if (isActive === "true") {
    filters.isActive = true;
  } else if (isActive === "false") {
    filters.isActive = false;
  }

  const published = searchParams.get("published");
  if (published === "true") {
    filters.published = true;
  } else if (published === "false") {
    filters.published = false;
  }

  const variantStatus = searchParams.get("variantStatus");
  if (variantStatus === "masters" || variantStatus === "variants" || variantStatus === "unlinked") {
    filters.variantStatus = variantStatus;
  }

  const hasDiscount = searchParams.get("hasDiscount");
  if (hasDiscount === "true") {
    filters.hasDiscount = true;
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
 * Serialize ProductFilters back to URLSearchParams.
 * Used when updating filters via UI.
 */
export function serializeProductFilters(
  filters: ProductFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams ? new URLSearchParams(baseParams) : new URLSearchParams();

  // Clear existing filter params
  [
    "search",
    "categoryId",
    "isActive",
    "published",
    "variantStatus",
    "hasDiscount",
    "page",
    "pageSize",
    "sort",
    "order",
  ].forEach((key) => params.delete(key));

  // Set new values
  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.isActive !== undefined) {
    params.set("isActive", String(filters.isActive));
  }

  if (filters.published !== undefined) {
    params.set("published", String(filters.published));
  }

  if (filters.variantStatus) {
    params.set("variantStatus", filters.variantStatus);
  }

  if (filters.hasDiscount) {
    params.set("hasDiscount", "true");
  }

  // Always include pagination and sorting
  params.set("page", String(filters.page ?? defaultProductFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultProductFilters.pageSize));
  params.set("sort", filters.sort ?? String(defaultProductFilters.sort));
  params.set("order", filters.order ?? String(defaultProductFilters.order));

  return params;
}

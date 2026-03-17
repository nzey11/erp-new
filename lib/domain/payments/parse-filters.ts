/**
 * Payment filters — typed contract for URL-driven filtering.
 * This is the source of truth for all filter-related logic in payments module.
 */
export interface PaymentFilters {
  /** Payment type filter */
  type?: "income" | "expense";

  /** Category ID filter */
  categoryId?: string;

  /** Counterparty ID filter */
  counterpartyId?: string;

  /** Document ID filter */
  documentId?: string;

  /** Start date filter (inclusive) */
  dateFrom?: string;

  /** End date filter (inclusive) */
  dateTo?: string;

  /** Search query (number, description) */
  search?: string;

  /** Payment method filter */
  paymentMethod?: "cash" | "bank_transfer" | "card";

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
export const defaultPaymentFilters: PaymentFilters = {
  page: 1,
  pageSize: 20,
  sort: "date",
  order: "desc",
};

/**
 * Parse URL search params into typed PaymentFilters.
 * This is the single entry point for filter parsing.
 */
export function parsePaymentFilters(
  searchParams: URLSearchParams
): PaymentFilters {
  const filters: PaymentFilters = {
    page: defaultPaymentFilters.page,
    pageSize: defaultPaymentFilters.pageSize,
    sort: defaultPaymentFilters.sort,
    order: defaultPaymentFilters.order,
  };

  const type = searchParams.get("type");
  if (type === "income" || type === "expense") {
    filters.type = type;
  }

  const categoryId = searchParams.get("categoryId");
  if (categoryId) {
    filters.categoryId = categoryId;
  }

  const counterpartyId = searchParams.get("counterpartyId");
  if (counterpartyId) {
    filters.counterpartyId = counterpartyId;
  }

  const documentId = searchParams.get("documentId");
  if (documentId) {
    filters.documentId = documentId;
  }

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) {
    filters.dateFrom = dateFrom;
  }

  const dateTo = searchParams.get("dateTo");
  if (dateTo) {
    filters.dateTo = dateTo;
  }

  const search = searchParams.get("search");
  if (search) {
    filters.search = search;
  }

  const paymentMethod = searchParams.get("paymentMethod");
  if (
    paymentMethod === "cash" ||
    paymentMethod === "bank_transfer" ||
    paymentMethod === "card"
  ) {
    filters.paymentMethod = paymentMethod;
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
 * Serialize PaymentFilters back to URLSearchParams.
 * Used when updating filters via UI.
 */
export function serializePaymentFilters(
  filters: PaymentFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams ? new URLSearchParams(baseParams) : new URLSearchParams();

  // Clear existing filter params
  [
    "type",
    "categoryId",
    "counterpartyId",
    "documentId",
    "dateFrom",
    "dateTo",
    "search",
    "paymentMethod",
    "page",
    "pageSize",
    "sort",
    "order",
  ].forEach((key) => params.delete(key));

  // Set new values
  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.counterpartyId) {
    params.set("counterpartyId", filters.counterpartyId);
  }

  if (filters.documentId) {
    params.set("documentId", filters.documentId);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }

  // Always include pagination and sorting
  params.set("page", String(filters.page ?? defaultPaymentFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultPaymentFilters.pageSize));
  params.set("sort", filters.sort ?? String(defaultPaymentFilters.sort));
  params.set("order", filters.order ?? String(defaultPaymentFilters.order));

  return params;
}

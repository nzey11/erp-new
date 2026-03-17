/**
 * Sales document filters — typed contract for URL-driven filtering.
 * Covers the three simple sales tabs: all, outgoing_shipment, customer_return.
 * SalesOrdersView (sales_order tab) uses its own client-side state — not covered here.
 */

export interface SalesFilters {
  /** Search query — document number */
  search?: string;

  /**
   * Active tab / document type scope.
   * "all" or "" → group=sales (all 3 types)
   * "outgoing_shipment" → specific type
   * "customer_return" → specific type
   * "sales_order" and "profitability" are handled client-side, not via server query
   */
  tab?: string;

  /** Status filter: draft | confirmed | cancelled */
  status?: string;

  /** Date range start (ISO date YYYY-MM-DD) */
  dateFrom?: string;

  /** Date range end (ISO date YYYY-MM-DD) */
  dateTo?: string;

  /** Counterparty ID filter */
  counterpartyId?: string;

  /** Current page (1-based) */
  page?: number;

  /** Page size */
  pageSize?: number;

  /** Sort field */
  sort?: string;

  /** Sort order */
  order?: "asc" | "desc";
}

export const defaultSalesFilters: SalesFilters = {
  page: 1,
  pageSize: 25,
  sort: "date",
  order: "desc",
};

/** Simple tabs that go through the server query */
export const SALES_SIMPLE_TABS = ["all", "outgoing_shipment", "customer_return"] as const;
export type SalesSimpleTab = (typeof SALES_SIMPLE_TABS)[number];

export function isSalesSimpleTab(tab: string | undefined): tab is SalesSimpleTab {
  return !tab || SALES_SIMPLE_TABS.includes(tab as SalesSimpleTab);
}

export function parseSalesFilters(searchParams: URLSearchParams): SalesFilters {
  const filters: SalesFilters = {
    page: defaultSalesFilters.page,
    pageSize: defaultSalesFilters.pageSize,
    sort: defaultSalesFilters.sort,
    order: defaultSalesFilters.order,
  };

  const search = searchParams.get("search");
  if (search) filters.search = search;

  const tab = searchParams.get("tab");
  if (tab) filters.tab = tab;

  const status = searchParams.get("status");
  if (status) filters.status = status;

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const counterpartyId = searchParams.get("counterpartyId");
  if (counterpartyId) filters.counterpartyId = counterpartyId;

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

export function serializeSalesFilters(
  filters: SalesFilters,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams
    ? new URLSearchParams(baseParams)
    : new URLSearchParams();

  [
    "search", "tab", "status", "dateFrom", "dateTo",
    "counterpartyId", "page", "pageSize", "sort", "order",
  ].forEach((key) => params.delete(key));

  if (filters.search) params.set("search", filters.search);
  if (filters.tab) params.set("tab", filters.tab);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.counterpartyId) params.set("counterpartyId", filters.counterpartyId);

  params.set("page", String(filters.page ?? defaultSalesFilters.page));
  params.set("pageSize", String(filters.pageSize ?? defaultSalesFilters.pageSize));

  if (filters.sort && filters.sort !== defaultSalesFilters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.order && filters.order !== defaultSalesFilters.order) {
    params.set("order", filters.order);
  }

  return params;
}

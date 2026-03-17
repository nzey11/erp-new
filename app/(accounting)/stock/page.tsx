import { Suspense } from "react";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { parseStockFilters } from "@/lib/domain/stock/parse-filters";
import { getStockBalances } from "@/lib/domain/stock/queries";
import { parseStockDocumentFilters } from "@/lib/domain/stock-documents/parse-filters";
import { getStockDocuments } from "@/lib/domain/stock-documents/queries";
import { StockPageClient } from "./_components/stock-page-client";

/**
 * Stock page — Server Component.
 *
 * Strangler pattern: this page is being incrementally migrated.
 *
 * Wave 3 Final scope:
 * - Balances tab: migrated to new ERP architecture (server-side fetch + ERPTable)
 * - Document tabs (inventory, write_off, stock_receipt): now on ERPTable architecture
 *
 * Data flow:
 * 1. Read searchParams from URL
 * 2. Parse into typed filters (StockFilters for balances, StockDocumentFilters for docs)
 * 3. Fetch data server-side in parallel
 * 4. Pass serializable props to StockPageClient (tab orchestrator)
 */
interface StockPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Stock document tab types that need server-side data fetching
const STOCK_DOC_TABS = ["inventory", "write_off", "stock_receipt"];

// Map tab values to document types
const TAB_TO_DOC_TYPE: Record<string, string> = {
  inventory: "inventory_count",
  write_off: "write_off",
  stock_receipt: "stock_receipt",
};

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;

  // Convert Next.js searchParams to URLSearchParams
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlParams.set(key, value);
    } else if (Array.isArray(value)) {
      urlParams.set(key, value[0] ?? "");
    }
  });

  // Parse filters for both balances and document tabs
  const stockFilters = parseStockFilters(urlParams);
  const stockDocFilters = parseStockDocumentFilters(urlParams);

  // Determine active tab (default to balances)
  const activeTab = urlParams.get("tab") || "balances";
  const isStockDocTab = STOCK_DOC_TABS.includes(activeTab);

  // If on a stock document tab, set the type filter
  if (isStockDocTab && TAB_TO_DOC_TYPE[activeTab]) {
    stockDocFilters.type = TAB_TO_DOC_TYPE[activeTab];
  }

  // Fetch stock balances and active warehouses in parallel
  // requirePermission is called inside getStockBalances/getStockDocuments too;
  // calling separately here to get tenantId for the warehouse query.
  const session = await requirePermission("stock:read");

  // Fetch data based on active tab
  const [stockData, stockDocData, warehouses] = await Promise.all([
    // Always fetch stock balances (for balances tab)
    getStockBalances(stockFilters),
    // Fetch stock documents if on a document tab, otherwise fetch with default filters
    getStockDocuments(stockDocFilters),
    // Always fetch warehouses (needed for both tabs)
    db.warehouse.findMany({
      where: { isActive: true, tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground">
          Загрузка склада...
        </div>
      }
    >
      <StockPageClient
        initialData={stockData}
        initialFilters={stockFilters}
        warehouses={warehouses}
        stockDocInitialData={stockDocData}
        stockDocInitialFilters={stockDocFilters}
        activeTab={activeTab}
      />
    </Suspense>
  );
}

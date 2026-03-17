import { Suspense } from "react";
import { parseSalesFilters } from "@/lib/domain/sales/parse-filters";
import { getSalesDocuments } from "@/lib/domain/sales/queries";
import { parseSalesOrderFilters } from "@/lib/domain/sales-orders/parse-filters";
import { getSalesOrders } from "@/lib/domain/sales-orders/queries";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { SalesPageClient } from "./_components/sales-page-client";

// Force dynamic rendering - this page requires authentication
export const dynamic = "force-dynamic";

interface SalesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Sales page — async Server Component.
 *
 * Handles simple tabs (all / outgoing_shipment / customer_return) via server fetch.
 * sales_order tab → server-fetched via getSalesOrders() (ERPTable-based, Step 4b).
 * profitability tab → deferred legacy placeholder.
 */
export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requirePermission("documents:read");
  const resolvedParams = await searchParams;

  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") urlParams.set(key, value);
    else if (Array.isArray(value) && value[0]) urlParams.set(key, value[0]);
  }

  const filters = parseSalesFilters(urlParams);
  const salesOrderFilters = parseSalesOrderFilters(urlParams);

  // Determine which data to fetch based on active tab
  const activeTab = filters.tab;
  const isSimpleTab =
    !activeTab ||
    activeTab === "all" ||
    activeTab === "outgoing_shipment" ||
    activeTab === "customer_return";
  const isSalesOrderTab = activeTab === "sales_order";

  const [simpleData, salesOrderData, counterparties] = await Promise.all([
    isSimpleTab
      ? getSalesDocuments(filters)
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 }),
    isSalesOrderTab
      ? getSalesOrders(salesOrderFilters)
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 }),
    db.counterparty.findMany({
      where: { isActive: true, tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Загрузка...</div>}>
      <SalesPageClient
        initialData={simpleData}
        initialFilters={filters}
        counterparties={counterparties}
        salesOrderInitialData={salesOrderData}
        salesOrderInitialFilters={salesOrderFilters}
      />
    </Suspense>
  );
}

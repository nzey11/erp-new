import { Suspense } from "react";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { parseFilters } from "@/lib/domain/purchases/parse-filters";
import { getPurchaseDocuments } from "@/lib/domain/purchases/queries";
import { PurchasesPageClient } from "./_components/purchases-page-client";

/**
 * Purchases page — Server Component.
 *
 * Strangler pattern: this page is being incrementally migrated.
 *
 * Wave 3 Step 2 scope:
 * - Document list tabs (all, purchase_order, incoming_shipment, supplier_return):
 *   migrated to new ERP architecture (server-side fetch + ERPTable)
 * - Analytics tab: still on legacy DataGrid (unchanged)
 *
 * Data flow:
 * 1. Read searchParams from URL (document filters)
 * 2. Parse into typed PurchaseFilters
 * 3. Fetch purchase documents + counterparties + warehouses server-side in parallel
 * 4. Pass serializable props to PurchasesPageClient (tab orchestrator)
 * 5. PurchasesPageClient renders document tabs (new) or analytics tab (legacy)
 */
interface PurchasesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
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

  const filters = parseFilters(urlParams);

  // Fetch purchase documents and references in parallel
  // requirePermission is called inside getPurchaseDocuments too; calling separately here
  // to get tenantId for the reference queries without duplicating the check.
  const session = await requirePermission("documents:read");

  const [data, counterparties, warehouses] = await Promise.all([
    getPurchaseDocuments(filters),
    db.counterparty.findMany({
      where: {
        type: { in: ["supplier", "both"] },
        isActive: true,
        tenantId: session.tenantId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.warehouse.findMany({
      where: { isActive: true, tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Calculate default analytics date range (last month)
  const d = new Date();
  const analyticsDateTo = d.toISOString().split("T")[0];
  d.setMonth(d.getMonth() - 1);
  const analyticsDateFrom = d.toISOString().split("T")[0];

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground">
          Загрузка закупок...
        </div>
      }
    >
      <PurchasesPageClient
        initialData={data}
        initialFilters={filters}
        counterparties={counterparties}
        warehouses={warehouses}
        analyticsInitialDateFrom={analyticsDateFrom}
        analyticsInitialDateTo={analyticsDateTo}
      />
    </Suspense>
  );
}

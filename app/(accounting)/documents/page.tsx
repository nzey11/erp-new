import { Suspense } from "react";
import { parseDocumentFilters } from "@/lib/domain/documents/parse-filters";
import { getDocuments } from "@/lib/domain/documents/queries";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { DocumentsPageClient } from "./_components/documents-page-client";

// Force dynamic rendering - this page requires authentication
export const dynamic = "force-dynamic";

interface DocumentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const session = await requirePermission("documents:read");
  const resolvedParams = await searchParams;

  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") urlParams.set(key, value);
    else if (Array.isArray(value) && value[0]) urlParams.set(key, value[0]);
  }

  const filters = parseDocumentFilters(urlParams);

  const [data, counterparties, warehouses] = await Promise.all([
    getDocuments(filters),
    db.counterparty.findMany({
      where: { isActive: true, tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.warehouse.findMany({
      where: { isActive: true, tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Загрузка...</div>}>
      <DocumentsPageClient
        initialData={data}
        initialFilters={filters}
        counterparties={counterparties}
        warehouses={warehouses}
      />
    </Suspense>
  );
}

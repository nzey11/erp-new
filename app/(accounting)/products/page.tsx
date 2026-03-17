import { Suspense } from "react";
import { db } from "@/lib/shared/db";
import { parseProductFilters } from "@/lib/domain/products/parse-filters";
import { getProducts } from "@/lib/domain/products/queries";
import { ProductsPageClient } from "./_components/products-page-client";

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[]>>;
}

/**
 * Products Catalog page — Server Component.
 *
 * Wave 1 scope:
 * - Catalog tab only (Categories/Units tabs deferred)
 * - URL-driven filters (parseProductFilters)
 * - Server-side data fetch (getProducts)
 * - Passes serializable props to ProductsPageClient
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
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

  const filters = parseProductFilters(urlParams);

  // Fetch products and categories in parallel
  // Note: ProductCategory is a global model (no tenantId)
  const [data, categories] = await Promise.all([
    getProducts(filters),
    db.productCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Suspense fallback={<div className="p-8 text-center">Загрузка каталога...</div>}>
      <ProductsPageClient
        initialData={data}
        initialFilters={filters}
        categories={categories}
      />
    </Suspense>
  );
}

import { Suspense } from "react";
import { parseCounterpartyFilters } from "@/lib/domain/counterparties/parse-filters";
import { getCounterparties } from "@/lib/domain/counterparties/queries";
import { CounterpartiesPageClient } from "./_components/counterparties-page-client";

/**
 * Counterparties list page — Server Component.
 *
 * Data flow:
 * 1. Read searchParams from URL
 * 2. Parse into typed CounterpartyFilters
 * 3. Fetch data server-side via getCounterparties()
 * 4. Pass serializable props to CounterpartiesPageClient
 *
 * No client-side fetching, no ref.current?.refresh().
 */
interface CounterpartiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CounterpartiesPage({
  searchParams,
}: CounterpartiesPageProps) {
  // Await searchParams (Next.js 15+ async API)
  const params = await searchParams;

  // Convert to URLSearchParams for parsing
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlParams.set(key, value);
    } else if (Array.isArray(value)) {
      // Take first value for arrays
      urlParams.set(key, value[0]);
    }
  });

  // Parse filters and fetch data
  const filters = parseCounterpartyFilters(urlParams);
  const data = await getCounterparties(filters);

  return (
    <Suspense
      fallback={<div className="p-8 text-center">Загрузка контрагентов...</div>}
    >
      <CounterpartiesPageClient initialData={data} initialFilters={filters} />
    </Suspense>
  );
}

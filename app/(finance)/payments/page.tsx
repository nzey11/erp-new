import { Suspense } from "react";
import { parsePaymentFilters } from "@/lib/domain/payments/parse-filters";
import { getPayments } from "@/lib/domain/payments/queries";
import { PaymentsPageClient } from "./_components/payments-page-client";

/**
 * Payments list page — Server Component.
 *
 * Data flow:
 * 1. Read searchParams from URL
 * 2. Parse into typed PaymentFilters
 * 3. Fetch data server-side via getPayments()
 * 4. Pass serializable props to PaymentsPageClient
 *
 * No client-side fetching, no ref.current?.refresh().
 */
interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
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
  const filters = parsePaymentFilters(urlParams);
  const data = await getPayments(filters);

  return (
    <Suspense fallback={<div className="p-8 text-center">Загрузка платежей...</div>}>
      <PaymentsPageClient
        initialData={data}
        initialFilters={filters}
      />
    </Suspense>
  );
}

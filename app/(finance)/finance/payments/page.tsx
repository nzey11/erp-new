import { Suspense } from "react";
import { parsePaymentFilters } from "@/lib/domain/payments/parse-filters";
import { getPayments } from "@/lib/domain/payments/queries";
import { PaymentsPageClient } from "@/app/(finance)/payments/_components/payments-page-client";

/**
 * Payments list page — Server Component.
 *
 * Canonical URL: /finance/payments
 * Data flow:
 * 1. Read searchParams from URL
 * 2. Parse into typed PaymentFilters
 * 3. Fetch data server-side via getPayments()
 * 4. Pass serializable props to PaymentsPageClient
 */
interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const params = await searchParams;

  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlParams.set(key, value);
    } else if (Array.isArray(value)) {
      urlParams.set(key, value[0]);
    }
  });

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

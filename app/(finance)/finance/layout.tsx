import { verifySession } from "@/lib/shared/dal";

/**
 * Finance/finance sub-layout — Server Component auth gate.
 *
 * Defence-in-depth (Layer 3): secondary fallback covering /finance/* routes.
 * Parent (finance)/layout.tsx is Layer 2. Middleware is Layer 1.
 * Must remain a Server Component (no "use client") to run verifySession() server-side.
 */
export default async function FinanceAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();

  return <>{children}</>;
}

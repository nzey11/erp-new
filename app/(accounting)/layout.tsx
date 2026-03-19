import { verifySession } from "@/lib/shared/dal";
import AccountingClientShell from "./_shell/accounting-shell";

/**
 * Accounting route group layout — Server Component.
 *
 * Primary auth gate (Layer 2, defence-in-depth):
 * verifySession() redirects to /login if no valid session.
 * Client-side shell (CSRF prefetch, Ant Design) is in AccountingClientShell.
 */
export default async function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();

  return <AccountingClientShell>{children}</AccountingClientShell>;
}

import { verifySession } from "@/lib/shared/dal";
import FinanceClientShell from "./_shell/finance-shell";

/**
 * Finance route group layout — Server Component.
 *
 * Primary auth gate (Layer 2, defence-in-depth):
 * verifySession() redirects to /login if no valid session.
 * Client-side shell (Ant Design ConfigProvider) is in FinanceClientShell.
 */
export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();

  return <FinanceClientShell>{children}</FinanceClientShell>;
}

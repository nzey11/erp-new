import { verifySession } from "@/lib/shared/dal";
import DashboardClientShell from "./_shell/dashboard-shell";

/**
 * Dashboard route group layout — Server Component.
 *
 * Primary auth gate (Layer 2, defence-in-depth):
 * verifySession() redirects to /login if no valid session.
 * Client-side shell (CSRF prefetch, Ant Design) is in DashboardClientShell.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();

  return <DashboardClientShell>{children}</DashboardClientShell>;
}

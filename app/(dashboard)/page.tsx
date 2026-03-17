import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/shared/authorization";
import { DashboardService } from "@/lib/modules/dashboard/dashboard.service";
import { DashboardPageClient } from "./_components/dashboard-page-client";

/**
 * Main ERP Dashboard — Server Component.
 *
 * Canonical URL: /
 * Data flow: requireAuth → DashboardService.getSummary(tenantId) → DashboardPageClient
 */
export default async function DashboardPage() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect("/login");
  }

  const summary = await DashboardService.getSummary(session.tenantId);

  return <DashboardPageClient summary={summary} />;
}

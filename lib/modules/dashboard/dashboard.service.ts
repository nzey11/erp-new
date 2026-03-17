import "server-only";
import { StockService } from "@/lib/modules/accounting/services/stock.service";
import { DocumentService } from "@/lib/modules/accounting/services/document.service";
import { ReportService } from "@/lib/modules/accounting/services/report.service";
import { PaymentService } from "@/lib/modules/finance/services/payment.service";
import type { DashboardSummary, RecentDocument } from "./types";

/**
 * DashboardService — read-only aggregation across all modules.
 *
 * Rules:
 * - Delegates to module services (no duplicate DB queries)
 * - NO direct db.* calls — all data comes from module services
 * - NO mutations, NO write operations
 * - Other modules do NOT import from dashboard
 */
export const DashboardService = {
  async getSummary(tenantId: string): Promise<DashboardSummary> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      stockValue,
      revenueMonth,
      pendingDocuments,
      lowStockAlerts,
      recentDocs,
      cashFlow,
    ] = await Promise.all([
      StockService.getTotalValue(tenantId),
      ReportService.getMonthRevenue(tenantId, monthStart, now),
      DocumentService.getPendingCount(tenantId),
      StockService.getLowStockCount(tenantId),
      DocumentService.getRecent(tenantId, 10),
      PaymentService.getCashFlow(tenantId, monthStart, now),
    ]);

    const recentDocuments: RecentDocument[] = recentDocs.map((d) => ({
      id: d.id,
      number: d.number,
      type: d.type,
      status: d.status,
      totalAmount: Number(d.totalAmount),
      date: d.date,
      counterpartyName: d.counterparty?.name ?? null,
    }));

    return {
      stockValue,
      revenueMonth,
      pendingDocuments,
      lowStockAlerts,
      recentDocuments,
      cashFlow,
    };
  },
};

import "server-only";
import { db } from "@/lib/shared/db";
import type { DashboardSummary, RecentDocument, CashFlowSummary } from "./types";

/**
 * DashboardService — read-only aggregation across all modules.
 *
 * Rules:
 * - Imports FROM other modules via db queries (no circular imports)
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
      recentDocuments,
      cashFlow,
    ] = await Promise.all([
      DashboardService.getTotalStockValue(tenantId),
      DashboardService.getMonthRevenue(tenantId, monthStart, now),
      DashboardService.getPendingDocumentCount(tenantId),
      DashboardService.getLowStockCount(tenantId),
      DashboardService.getRecentDocuments(tenantId, 10),
      DashboardService.getCashFlow(tenantId, monthStart, now),
    ]);

    return {
      stockValue,
      revenueMonth,
      pendingDocuments,
      lowStockAlerts,
      recentDocuments,
      cashFlow,
    };
  },

  /** Total cost value of all stock records for the tenant */
  async getTotalStockValue(tenantId: string): Promise<number> {
    const records = await db.stockRecord.findMany({
      where: { warehouse: { tenantId } },
      select: { quantity: true, averageCost: true },
    });
    return records.reduce(
      (sum, r) => sum + Number(r.quantity) * Number(r.averageCost),
      0
    );
  },

  /** Total revenue from confirmed outgoing_shipment documents for the given period */
  async getMonthRevenue(tenantId: string, from: Date, to: Date): Promise<number> {
    const agg = await db.document.aggregate({
      _sum: { totalAmount: true },
      where: {
        tenantId,
        type: "outgoing_shipment",
        status: "confirmed",
        date: { gte: from, lte: to },
      },
    });
    return Number(agg._sum.totalAmount ?? 0);
  },

  /** Count of documents in draft/pending status */
  async getPendingDocumentCount(tenantId: string): Promise<number> {
    return db.document.count({
      where: { tenantId, status: "draft" },
    });
  },

  /** Count of products with zero stock across all warehouses (for the tenant) */
  async getLowStockCount(tenantId: string): Promise<number> {
    return db.stockRecord.count({
      where: {
        warehouse: { tenantId },
        quantity: { lte: 0 },
      },
    });
  },

  /** Most recent N documents for the tenant */
  async getRecentDocuments(tenantId: string, limit: number): Promise<RecentDocument[]> {
    const docs = await db.document.findMany({
      where: { tenantId },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        totalAmount: true,
        date: true,
        counterparty: { select: { name: true } },
      },
    });
    return docs.map((d) => ({
      id: d.id,
      number: d.number,
      type: d.type,
      status: d.status,
      totalAmount: Number(d.totalAmount),
      date: d.date,
      counterpartyName: d.counterparty?.name ?? null,
    }));
  },

  /** Cash flow summary from payments for the given period */
  async getCashFlow(tenantId: string, from: Date, to: Date): Promise<CashFlowSummary> {
    const [incomeAgg, expenseAgg] = await Promise.all([
      db.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, type: "income", date: { gte: from, lte: to } },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, type: "expense", date: { gte: from, lte: to } },
      }),
    ]);
    const cashIn = Number(incomeAgg._sum.amount ?? 0);
    const cashOut = Number(expenseAgg._sum.amount ?? 0);
    return { cashIn, cashOut, netCashFlow: cashIn - cashOut };
  },
};

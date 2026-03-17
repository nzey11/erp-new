import { NextRequest, NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { dateRangeSchema } from "@/lib/modules/accounting/schemas/reports.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:read");

    const query = parseQuery(request, dateRangeSchema);

    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);
    to.setHours(23, 59, 59, 999);

    // Get confirmed incoming shipments in date range
    const purchaseDocs = await db.document.findMany({
      where: {
        type: "incoming_shipment",
        status: "confirmed",
        date: { gte: from, lte: to },
      },
      include: {
        counterparty: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { date: "asc" },
    });

    // ── By Supplier ────────────────────────────────────────────────────────────
    const supplierMap: Record<string, { supplierId: string; supplierName: string; totalAmount: number; docCount: number }> = {};

    for (const doc of purchaseDocs) {
      const key = doc.counterpartyId ?? "__unknown__";
      if (!supplierMap[key]) {
        supplierMap[key] = {
          supplierId: key,
          supplierName: doc.counterparty?.name ?? "Без поставщика",
          totalAmount: 0,
          docCount: 0,
        };
      }
      supplierMap[key].totalAmount += toNumber(doc.totalAmount);
      supplierMap[key].docCount += 1;
    }

    const bySupplier = Object.values(supplierMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 20); // top-20

    // ── Monthly Dynamics ───────────────────────────────────────────────────────
    const monthMap: Record<string, { month: string; totalAmount: number; docCount: number }> = {};

    for (const doc of purchaseDocs) {
      const d = new Date(doc.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) {
        monthMap[key] = { month: key, totalAmount: 0, docCount: 0 };
      }
      monthMap[key].totalAmount += toNumber(doc.totalAmount);
      monthMap[key].docCount += 1;
    }

    const byMonth = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    // ── Totals ─────────────────────────────────────────────────────────────────
    const totalAmount = purchaseDocs.reduce((s, d) => s + toNumber(d.totalAmount), 0);
    const totalDocs = purchaseDocs.length;
    const averageOrder = totalDocs > 0 ? totalAmount / totalDocs : 0;

    return NextResponse.json({
      period: { from: query.dateFrom, to: query.dateTo },
      bySupplier,
      byMonth,
      totals: {
        totalAmount,
        totalDocs,
        averageOrder,
      },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

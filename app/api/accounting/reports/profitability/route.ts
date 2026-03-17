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

    // Get confirmed outgoing shipments in date range
    const salesDocs = await db.document.findMany({
      where: {
        type: "outgoing_shipment",
        status: "confirmed",
        date: { gte: from, lte: to },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    // Aggregate sales by product
    const productSales: Record<string, {
      productId: string;
      productName: string;
      sku: string | null;
      quantitySold: number;
      revenue: number;
    }> = {};

    for (const doc of salesDocs) {
      for (const item of doc.items) {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productId: item.productId,
            productName: item.product.name,
            sku: item.product.sku,
            quantitySold: 0,
            revenue: 0,
          };
        }
        productSales[item.productId].quantitySold += item.quantity;
        productSales[item.productId].revenue += toNumber(item.total);
      }
    }

    const productIds = Object.keys(productSales);

    // Get average cost from StockRecord (moving average cost)
    const stockRecords = productIds.length > 0
      ? await db.stockRecord.findMany({
          where: {
            productId: { in: productIds },
          },
          select: { productId: true, averageCost: true },
        })
      : [];

    // Build averageCost map (sum across warehouses, then average)
    const avgCostByProduct: Record<string, { totalCost: number; count: number }> = {};
    for (const sr of stockRecords) {
      if (!avgCostByProduct[sr.productId]) {
        avgCostByProduct[sr.productId] = { totalCost: 0, count: 0 };
      }
      const avgCost = toNumber(sr.averageCost);
      if (avgCost > 0) {
        avgCostByProduct[sr.productId].totalCost += avgCost;
        avgCostByProduct[sr.productId].count += 1;
      }
    }

    const avgCostMap: Record<string, number> = {};
    for (const [productId, data] of Object.entries(avgCostByProduct)) {
      avgCostMap[productId] = data.count > 0 ? data.totalCost / data.count : 0;
    }

    // Fallback to PurchasePrice for products without averageCost
    const productsNeedingFallback = productIds.filter((id) => !avgCostMap[id] || avgCostMap[id] === 0);
    const purchasePrices = productsNeedingFallback.length > 0
      ? await db.purchasePrice.findMany({
          where: {
            productId: { in: productsNeedingFallback },
            isActive: true,
          },
          orderBy: { validFrom: "desc" },
          select: { productId: true, price: true },
        })
      : [];

    const purchasePriceMap: Record<string, number> = {};
    for (const pp of purchasePrices) {
      if (!(pp.productId in purchasePriceMap)) {
        purchasePriceMap[pp.productId] = toNumber(pp.price);
      }
    }

    // Calculate profitability per product using averageCost (with fallback to PurchasePrice)
    const byProduct = Object.values(productSales).map((ps) => {
      // Prefer averageCost from StockRecord, fallback to PurchasePrice
      const costPrice = avgCostMap[ps.productId] || purchasePriceMap[ps.productId] || 0;
      const cost = ps.quantitySold * costPrice;
      const profit = ps.revenue - cost;
      const margin = ps.revenue > 0 ? (profit / ps.revenue) * 100 : 0;

      return {
        productId: ps.productId,
        productName: ps.productName,
        sku: ps.sku,
        quantitySold: ps.quantitySold,
        revenue: ps.revenue,
        costPrice,
        cost,
        profit,
        margin,
      };
    });

    // Sort by profit descending
    byProduct.sort((a, b) => b.profit - a.profit);

    // Totals
    const totalRevenue = byProduct.reduce((sum, r) => sum + r.revenue, 0);
    const totalCost = byProduct.reduce((sum, r) => sum + r.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return NextResponse.json({
      period: { from: query.dateFrom, to: query.dateTo },
      byProduct,
      totals: {
        totalRevenue,
        totalCost,
        totalProfit,
        averageMargin,
      },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

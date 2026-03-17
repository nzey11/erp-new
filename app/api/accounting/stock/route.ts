import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryStockSchema } from "@/lib/modules/accounting/schemas/reports.schema";
import { StockService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("stock:read");

    const query = parseQuery(request, queryStockSchema);

    const result = await StockService.getStock(
      {
        warehouseId: query.warehouseId,
        productId: query.productId,
        search: query.search,
        nonZero: query.nonZero,
        enhanced: query.enhanced,
      },
      session.tenantId
    );

    if (!result.enhanced) {
      // Legacy response format
      const records = result.records;
      const totals: Record<string, { productId: string; productName: string; sku: string | null; unit: string; total: number }> = {};
      for (const r of records) {
        if (!totals[r.productId]) {
          totals[r.productId] = {
            productId: r.productId,
            productName: r.product.name,
            sku: r.product.sku ?? null,
            unit: r.product.unit.shortName,
            total: 0,
          };
        }
        totals[r.productId].total += r.quantity;
      }
      return NextResponse.json({ records, totals: Object.values(totals) });
    }

    const { records, reserveMap, purchasePriceMap, salePriceMap } = result as Extract<typeof result, { enhanced: true }>;

    // Build enhanced records - use averageCost from StockRecord instead of PurchasePrice
    const enhancedRecords = records.map((r) => {
      const reserve = reserveMap[`${r.productId}:${r.warehouseId}`] || 0;
      const available = r.quantity - reserve;
      // Use averageCost from StockRecord (moving average) instead of PurchasePrice lookup
      const avgCostNum = Number(r.averageCost);
      const averageCost = avgCostNum > 0 ? avgCostNum : (purchasePriceMap[r.productId] ?? null);
      const salePrice = salePriceMap[r.productId] ?? null;

      return {
        productId: r.productId,
        productName: r.product.name,
        sku: r.product.sku,
        categoryName: r.product.category?.name ?? null,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouse.name,
        unitShortName: r.product.unit.shortName,
        quantity: r.quantity,
        reserve,
        available,
        averageCost,
        purchasePrice: purchasePriceMap[r.productId] ?? null, // Keep for reference
        salePrice,
        costValue: averageCost != null ? r.quantity * averageCost : null,
        saleValue: salePrice != null ? r.quantity * salePrice : null,
      };
    });

    // Compute totals
    let totalQuantity = 0;
    let totalReserve = 0;
    let totalAvailable = 0;
    let totalCostValue = 0;
    let totalSaleValue = 0;

    for (const r of enhancedRecords) {
      totalQuantity += r.quantity;
      totalReserve += r.reserve;
      totalAvailable += r.available;
      totalCostValue += r.costValue ?? 0;
      totalSaleValue += r.saleValue ?? 0;
    }

    return NextResponse.json({
      records: enhancedRecords,
      totals: {
        totalQuantity,
        totalReserve,
        totalAvailable,
        totalCostValue,
        totalSaleValue,
      },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

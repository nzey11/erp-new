import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryStockSchema } from "@/lib/modules/accounting/schemas/reports.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("stock:read");

    const query = parseQuery(request, queryStockSchema);

    const warehouseId = query.warehouseId;
    const productId = query.productId;
    const search = query.search || "";
    const nonZero = query.nonZero !== "false";
    const enhanced = query.enhanced === "true";

    const where: Record<string, unknown> = {
      warehouse: { tenantId: session.tenantId }, // Tenant scoping
    };
    if (warehouseId) where.warehouseId = warehouseId;
    if (productId) where.productId = productId;
    if (nonZero) where.quantity = { not: 0 };
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const records = await db.stockRecord.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: { select: { shortName: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    if (!enhanced) {
      // Legacy response format
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

    // Enhanced mode: calculate reserve, available, cost, sale values
    const productIds = [...new Set(records.map((r) => r.productId))];

    // Reserve: quantities in draft outgoing documents (outgoing_shipment, supplier_return, sales_order)
    const draftOutgoingItems = productIds.length > 0
      ? await db.documentItem.findMany({
          where: {
            productId: { in: productIds },
            document: {
              status: "draft",
              type: { in: ["outgoing_shipment", "supplier_return", "sales_order"] },
            },
          },
          select: {
            productId: true,
            quantity: true,
            document: { select: { warehouseId: true } },
          },
        })
      : [];

    // Build reserve map: key = productId:warehouseId
    const reserveMap: Record<string, number> = {};
    for (const item of draftOutgoingItems) {
      const key = `${item.productId}:${item.document.warehouseId || ""}`;
      reserveMap[key] = (reserveMap[key] || 0) + item.quantity;
    }

    // Latest purchase prices per product
    const purchasePrices = productIds.length > 0
      ? await db.purchasePrice.findMany({
          where: {
            productId: { in: productIds },
            isActive: true,
          },
          orderBy: { validFrom: "desc" },
          select: { productId: true, price: true },
        })
      : [];

    const purchasePriceMap: Record<string, number> = {};
    for (const pp of purchasePrices) {
      if (!(pp.productId in purchasePriceMap)) {
        purchasePriceMap[pp.productId] = Number(pp.price);
      }
    }

    // Latest sale prices per product (default price list = no priceListId)
    const salePrices = productIds.length > 0
      ? await db.salePrice.findMany({
          where: {
            productId: { in: productIds },
            isActive: true,
            priceListId: null, // Only default prices, not from price lists
          },
          orderBy: { validFrom: "desc" },
          select: { productId: true, price: true },
        })
      : [];

    const salePriceMap: Record<string, number> = {};
    for (const sp of salePrices) {
      if (!(sp.productId in salePriceMap)) {
        salePriceMap[sp.productId] = Number(sp.price);
      }
    }

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

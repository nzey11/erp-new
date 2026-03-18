import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { db, toNumber } from "@/lib/shared/db";

/**
 * GET /api/accounting/stock/records
 *
 * Returns raw StockRecord rows for a warehouse.
 *
 * Query params:
 *  - warehouseId  (required) — filter by warehouse
 *  - includeZero  (optional) — if "true", include records with quantity = 0
 *                              defaults to false (only non-zero records)
 *
 * Used by:
 *  - "Заполнить фактические остатки" button (includeZero=false)
 *  - "Заполнить все товары" button         (includeZero=true, combined with products)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("stock:read");

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");
    const includeZero = searchParams.get("includeZero") === "true";

    if (!warehouseId) {
      return NextResponse.json(
        { error: "Укажите warehouseId" },
        { status: 400 }
      );
    }

    const records = await db.stockRecord.findMany({
      where: {
        warehouseId,
        // Scope to tenant via warehouse ownership
        warehouse: { tenantId: session.tenantId },
        ...(!includeZero ? { quantity: { gt: 0 } } : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            isActive: true,
            unit: { select: { shortName: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    const result = records
      .filter((r) => r.product.isActive)
      .map((r) => ({
        productId: r.productId,
        warehouseId: r.warehouseId,
        quantity: toNumber(r.quantity),
        averageCost: toNumber(r.averageCost),
        product: {
          id: r.product.id,
          name: r.product.name,
          sku: r.product.sku,
          unit: r.product.unit?.shortName ?? "шт",
        },
      }));

    return NextResponse.json({ records: result });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

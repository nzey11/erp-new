import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("stock:read");

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {
      quantity: { not: 0 },
      warehouse: { tenantId: session.tenantId }, // Tenant scoping
    };
    if (warehouseId) where.warehouseId = warehouseId;
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
        warehouse: { select: { name: true } },
        product: {
          select: {
            name: true,
            sku: true,
            unit: { select: { shortName: true } },
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    const header = ["Товар", "Артикул", "Категория", "Склад", "Ед.", "Кол-во", "Средн. себест.", "Стоимость"].join(",");

    const rows = records.map((r) => {
      const costValue = r.averageCost > 0 ? r.quantity * r.averageCost : "";
      return [
        `"${r.product.name}"`,
        r.product.sku ? `"${r.product.sku}"` : "",
        r.product.category ? `"${r.product.category.name}"` : "",
        `"${r.warehouse.name}"`,
        r.product.unit.shortName,
        r.quantity,
        r.averageCost > 0 ? r.averageCost.toFixed(2) : "",
        costValue !== "" ? (costValue as number).toFixed(2) : "",
      ].join(",");
    });

    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const filename = `stock_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

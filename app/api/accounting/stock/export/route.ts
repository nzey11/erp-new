import { NextRequest, NextResponse } from "next/server";
import { toNumber } from "@/lib/modules/accounting";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { StockService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("stock:read");

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId") || "";
    const search = searchParams.get("search") || "";

    const records = await StockService.exportStockRecords(
      { warehouseId, search },
      session.tenantId
    );

    const header = ["Товар", "Артикул", "Категория", "Склад", "Ед.", "Кол-во", "Средн. себест.", "Стоимость"].join(",");

    const rows = records.map((r) => {
      const costValue = toNumber(r.averageCost) > 0 ? r.quantity * toNumber(r.averageCost) : "";
      return [
        `"${r.product.name}"`,
        r.product.sku ? `"${r.product.sku}"` : "",
        r.product.category ? `"${r.product.category.name}"` : "",
        `"${r.warehouse.name}"`,
        r.product.unit.shortName,
        r.quantity,
        toNumber(r.averageCost) > 0 ? toNumber(r.averageCost).toFixed(2) : "",
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

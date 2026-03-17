import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery } from "@/lib/shared/validation";
import { exportProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { ProductService } from "@/lib/modules/accounting";

const DEFAULT_COLUMNS = [
  "name", "sku", "barcode", "category", "unit",
  "purchasePrice", "salePrice", "description",
];

const COLUMN_HEADERS: Record<string, string> = {
  name: "Название", sku: "Артикул", barcode: "Штрихкод",
  category: "Категория", unit: "Ед. изм.", purchasePrice: "Цена закупки",
  salePrice: "Цена продажи", description: "Описание",
  createdAt: "Дата создания", isActive: "Активен", publishedToStore: "На сайте",
};

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");

    const query = parseQuery(request, exportProductsSchema);
    const { search, categoryId, active, published, hasDiscount, columns } = query;

    const products = await ProductService.exportProducts({ search, categoryId, active, published, hasDiscount });

    const exportColumns = columns
      ? columns.split(",").filter((c) => COLUMN_HEADERS[c])
      : DEFAULT_COLUMNS;

    const header = exportColumns.map((c) => escapeCSV(COLUMN_HEADERS[c])).join(",");

    const rows = products.map((product) => {
      return exportColumns.map((col) => {
        switch (col) {
          case "name": return escapeCSV(product.name);
          case "sku": return escapeCSV(product.sku);
          case "barcode": return escapeCSV(product.barcode);
          case "category": return escapeCSV(product.category?.name);
          case "unit": return escapeCSV(product.unit?.shortName || product.unit?.name);
          case "purchasePrice": return product.purchasePrices[0]?.price?.toString() || "";
          case "salePrice": return product.salePrices[0]?.price?.toString() || "";
          case "description": return escapeCSV(product.description);
          case "createdAt": return product.createdAt.toISOString().split("T")[0];
          case "isActive": return product.isActive ? "Да" : "Нет";
          case "publishedToStore": return product.publishedToStore ? "Да" : "Нет";
          default: return "";
        }
      }).join(",");
    });

    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const filename = `products_${new Date().toISOString().split("T")[0]}.csv`;

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

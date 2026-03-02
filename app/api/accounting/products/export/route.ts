import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery } from "@/lib/shared/validation";
import { exportProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";

const DEFAULT_COLUMNS = [
  "name",
  "sku",
  "barcode",
  "category",
  "unit",
  "purchasePrice",
  "salePrice",
  "description",
];

const COLUMN_HEADERS: Record<string, string> = {
  name: "Название",
  sku: "Артикул",
  barcode: "Штрихкод",
  category: "Категория",
  unit: "Ед. изм.",
  purchasePrice: "Цена закупки",
  salePrice: "Цена продажи",
  description: "Описание",
  createdAt: "Дата создания",
  isActive: "Активен",
  publishedToStore: "На сайте",
};

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  // Escape quotes and wrap in quotes if contains special characters
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

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (active !== undefined) {
      where.isActive = active === "true";
    }

    if (published) {
      where.publishedToStore = published === "true";
    }

    if (hasDiscount === "true") {
      const now = new Date();
      where.discounts = {
        some: {
          isActive: true,
          OR: [
            { validTo: null },
            { validTo: { gte: now } },
          ],
        },
      };
    }

    // Fetch products with relations
    const products = await db.product.findMany({
      where,
      include: {
        unit: { select: { name: true, shortName: true } },
        category: { select: { name: true } },
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
        purchasePrices: {
          where: { isActive: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    // Determine columns to export
    const exportColumns = columns
      ? columns.split(",").filter((c) => COLUMN_HEADERS[c])
      : DEFAULT_COLUMNS;

    // Build CSV header
    const header = exportColumns.map((c) => escapeCSV(COLUMN_HEADERS[c])).join(",");

    // Build CSV rows
    const rows = products.map((product) => {
      return exportColumns
        .map((col) => {
          switch (col) {
            case "name":
              return escapeCSV(product.name);
            case "sku":
              return escapeCSV(product.sku);
            case "barcode":
              return escapeCSV(product.barcode);
            case "category":
              return escapeCSV(product.category?.name);
            case "unit":
              return escapeCSV(product.unit?.shortName || product.unit?.name);
            case "purchasePrice":
              return product.purchasePrices[0]?.price?.toString() || "";
            case "salePrice":
              return product.salePrices[0]?.price?.toString() || "";
            case "description":
              return escapeCSV(product.description);
            case "createdAt":
              return product.createdAt.toISOString().split("T")[0];
            case "isActive":
              return product.isActive ? "Да" : "Нет";
            case "publishedToStore":
              return product.publishedToStore ? "Да" : "Нет";
            default:
              return "";
          }
        })
        .join(",");
    });

    const csv = [header, ...rows].join("\n");

    // Add BOM for UTF-8 Excel compatibility
    const bom = "\uFEFF";
    const csvWithBom = bom + csv;

    const filename = `products_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvWithBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

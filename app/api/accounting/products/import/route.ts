import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { importProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { ProductService } from "@/lib/modules/accounting";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("products:write");

    const data = await parseBody(request, importProductsSchema);
    const { products, updateExisting } = data;

    const { units, categories } = await ProductService.importLoadUnitsAndCategories();

    const unitsByName = new Map(units.map((u) => [u.name.toLowerCase(), u]));
    const unitsByShort = new Map(units.map((u) => [u.shortName.toLowerCase(), u]));
    const categoriesByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    const defaultUnit = units[0];
    if (!defaultUnit) {
      return NextResponse.json(
        { error: "Нет доступных единиц измерения. Создайте хотя бы одну." },
        { status: 400 }
      );
    }

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const rowNum = i + 1;

      try {
        let unitId = defaultUnit.id;
        if (row.unitName) {
          const unitName = row.unitName.toLowerCase().trim();
          const unit = unitsByName.get(unitName) || unitsByShort.get(unitName);
          if (unit) unitId = unit.id;
        }

        let categoryId: string | null = null;
        if (row.categoryName) {
          const category = categoriesByName.get(row.categoryName.toLowerCase().trim());
          if (category) categoryId = category.id;
        }

        let existingProduct = null;
        if (row.sku) {
          existingProduct = await ProductService.importFindBySku(row.sku);
        }

        if (existingProduct) {
          if (updateExisting) {
            await ProductService.importUpdateProduct(
              existingProduct.id,
              {
                name: row.name,
                barcode: row.barcode || existingProduct.barcode,
                description: row.description || existingProduct.description,
                unitId,
                categoryId,
              },
              { purchasePrice: row.purchasePrice, salePrice: row.salePrice }
            );
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          await ProductService.importCreateProduct(
            {
              tenantId: session.tenantId, // Tenant-scoped product
              name: row.name,
              sku: row.sku || null,
              barcode: row.barcode || null,
              description: row.description || null,
              unitId,
              categoryId,
            },
            { purchasePrice: row.purchasePrice, salePrice: row.salePrice }
          );
          result.created++;
        }
      } catch (e) {
        result.errors.push({
          row: rowNum,
          error: e instanceof Error ? e.message : "Неизвестная ошибка",
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

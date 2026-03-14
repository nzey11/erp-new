import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { importProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";

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

    // Load units and categories for matching by name
    const [units, categories] = await Promise.all([
      db.unit.findMany({ where: { isActive: true } }),
      db.productCategory.findMany({ where: { isActive: true } }),
    ]);

    const unitsByName = new Map(units.map((u) => [u.name.toLowerCase(), u]));
    const unitsByShort = new Map(units.map((u) => [u.shortName.toLowerCase(), u]));
    const categoriesByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    // Get default unit
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
        // Find unit by name
        let unitId = defaultUnit.id;
        if (row.unitName) {
          const unitName = row.unitName.toLowerCase().trim();
          const unit = unitsByName.get(unitName) || unitsByShort.get(unitName);
          if (unit) unitId = unit.id;
        }

        // Find category by name
        let categoryId: string | null = null;
        if (row.categoryName) {
          const category = categoriesByName.get(row.categoryName.toLowerCase().trim());
          if (category) categoryId = category.id;
        }

        // Check if product with same SKU exists
        let existingProduct = null;
        if (row.sku) {
          existingProduct = await db.product.findFirst({
            where: { sku: row.sku },
          });
        }

        if (existingProduct) {
          if (updateExisting) {
            // Update existing product
            await db.product.update({
              where: { id: existingProduct.id },
              data: {
                name: row.name,
                barcode: row.barcode || existingProduct.barcode,
                description: row.description || existingProduct.description,
                unitId,
                categoryId,
              },
            });

            // Update prices if provided
            if (row.purchasePrice != null) {
              await db.purchasePrice.updateMany({
                where: { productId: existingProduct.id, isActive: true },
                data: { isActive: false },
              });
              await db.purchasePrice.create({
                data: {
                  productId: existingProduct.id,
                  price: row.purchasePrice,
                  validFrom: new Date(),
                },
              });
            }

            if (row.salePrice != null) {
              await db.salePrice.updateMany({
                where: { productId: existingProduct.id, isActive: true, priceListId: null },
                data: { isActive: false },
              });
              await db.salePrice.create({
                data: {
                  productId: existingProduct.id,
                  price: row.salePrice,
                  validFrom: new Date(),
                },
              });
            }

            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          // Create new product
          const newProduct = await db.product.create({
            data: {
              tenantId: session.tenantId, // Tenant-scoped product
              name: row.name,
              sku: row.sku || null,
              barcode: row.barcode || null,
              description: row.description || null,
              unitId,
              categoryId,
            },
          });

          // Create prices if provided
          if (row.purchasePrice != null) {
            await db.purchasePrice.create({
              data: {
                productId: newProduct.id,
                price: row.purchasePrice,
                validFrom: new Date(),
              },
            });
          }

          if (row.salePrice != null) {
            await db.salePrice.create({
              data: {
                productId: newProduct.id,
                price: row.salePrice,
                validFrom: new Date(),
              },
            });
          }

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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { bulkProductActionSchema } from "@/lib/modules/accounting/schemas/products.schema";

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, bulkProductActionSchema);
    const { action, productIds, categoryId } = data;

    let result: { count: number };

    switch (action) {
      case "archive":
        result = await db.product.updateMany({
          where: { id: { in: productIds } },
          data: { isActive: false },
        });
        break;

      case "restore":
        result = await db.product.updateMany({
          where: { id: { in: productIds } },
          data: { isActive: true },
        });
        break;

      case "delete":
        // Hard delete - use with caution
        // First delete related records to avoid foreign key constraints
        await db.$transaction(async (tx) => {
          // Delete custom fields
          await tx.productCustomField.deleteMany({
            where: { productId: { in: productIds } },
          });
          // Delete variant links (both directions)
          await tx.productVariantLink.deleteMany({
            where: { OR: [{ productId: { in: productIds } }, { linkedProductId: { in: productIds } }] },
          });
          // Delete discounts
          await tx.productDiscount.deleteMany({
            where: { productId: { in: productIds } },
          });
          // Delete variants
          await tx.productVariant.deleteMany({
            where: { productId: { in: productIds } },
          });
          // Delete prices
          await tx.purchasePrice.deleteMany({
            where: { productId: { in: productIds } },
          });
          await tx.salePrice.deleteMany({
            where: { productId: { in: productIds } },
          });
          // Delete stock records
          await tx.stockRecord.deleteMany({
            where: { productId: { in: productIds } },
          });
          // Finally delete products
          await tx.product.deleteMany({
            where: { id: { in: productIds } },
          });
        });
        result = { count: productIds.length };
        break;

      case "changeCategory":
        if (!categoryId) {
          return NextResponse.json({ error: "categoryId обязателен для смены категории" }, { status: 400 });
        }
        result = await db.product.updateMany({
          where: { id: { in: productIds } },
          data: { categoryId },
        });
        break;

      default:
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

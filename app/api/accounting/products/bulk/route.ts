import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { bulkProductActionSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";
import { ProductService } from "@/lib/modules/accounting";

/**
 * Emit a product.updated outbox event for each productId inside a transaction.
 */
async function emitBulkProductEvents(
  tx: Parameters<Parameters<typeof ProductService.$transaction>[0]>[0],
  productIds: string[]
): Promise<void> {
  for (const productId of productIds) {
    await createOutboxEvent(
      tx,
      { type: "product.updated", occurredAt: new Date(), payload: { productId } },
      "Product",
      productId
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, bulkProductActionSchema);
    const { action, productIds, categoryId } = data;

    let result: { count: number };

    switch (action) {
      case "archive":
        result = await ProductService.$transaction(async (tx) => {
          const r = await ProductService.bulkUpdateMany(productIds, { isActive: false }, tx);
          await emitBulkProductEvents(tx, productIds);
          return r;
        });
        break;

      case "restore":
        result = await ProductService.$transaction(async (tx) => {
          const r = await ProductService.bulkUpdateMany(productIds, { isActive: true }, tx);
          await emitBulkProductEvents(tx, productIds);
          return r;
        });
        break;

      case "delete":
        // Hard delete - use with caution
        await ProductService.$transaction(async (tx) => {
          await ProductService.bulkHardDelete(productIds, tx);
          // No outbox events for hard delete — projection row is removed by DB cascade
        });
        result = { count: productIds.length };
        break;

      case "changeCategory":
        if (!categoryId) {
          return NextResponse.json({ error: "categoryId обязателен для смены категории" }, { status: 400 });
        }
        result = await ProductService.$transaction(async (tx) => {
          const r = await ProductService.bulkUpdateMany(productIds, { categoryId }, tx);
          await emitBulkProductEvents(tx, productIds);
          return r;
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

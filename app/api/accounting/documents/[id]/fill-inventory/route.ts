import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/accounting/documents/[id]/fill-inventory
 *
 * Fills an inventory_count document with current stock data.
 * Sets expectedQty = current stock quantity for each product on the warehouse.
 * Only works on draft inventory_count documents.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:write");
    const { id } = await params;

    const doc = await db.document.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }
    if (doc.type !== "inventory_count") {
      return NextResponse.json(
        { error: "Заполнение доступно только для инвентаризации" },
        { status: 400 }
      );
    }
    if (doc.status !== "draft") {
      return NextResponse.json(
        { error: "Заполнение доступно только для черновиков" },
        { status: 400 }
      );
    }
    if (!doc.warehouseId) {
      return NextResponse.json(
        { error: "Укажите склад в документе" },
        { status: 400 }
      );
    }

    // Get all stock records for this warehouse
    const stockRecords = await db.stockRecord.findMany({
      where: {
        warehouseId: doc.warehouseId,
        quantity: { not: 0 },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, isActive: true } },
      },
    });

    // Remove existing items and replace with stock data
    await db.documentItem.deleteMany({ where: { documentId: id } });

    const itemsData = stockRecords
      .filter((sr) => sr.product.isActive)
      .map((sr) => ({
        documentId: id,
        productId: sr.productId,
        quantity: 0,
        price: sr.averageCost,
        total: 0,
        expectedQty: sr.quantity,
        actualQty: sr.quantity, // Default actual = expected; user changes it
        difference: 0,
      }));

    if (itemsData.length > 0) {
      await db.documentItem.createMany({ data: itemsData });
    }

    // Reload document with new items
    const updated = await db.document.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: { select: { shortName: true } } },
            },
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

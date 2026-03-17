import { NextRequest, NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createDiscountSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const discounts = await db.productDiscount.findMany({
      where: { productId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(discounts);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id: productId } = await params;
    const data = await parseBody(request, createDiscountSchema);
    const { name, type, value, validFrom, validTo } = data;

    if (type === "percentage" && (value <= 0 || value > 100)) {
      return NextResponse.json({ error: "Процент скидки должен быть от 0 до 100" }, { status: 400 });
    }

    // Get product with current purchase price (cost) to validate
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        purchasePrices: {
          where: { isActive: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
        salePrices: {
          where: { isActive: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const purchasePrice = toNumber(product.purchasePrices[0]?.price);
    const salePrice = toNumber(product.salePrices[0]?.price);

    // Calculate discounted price and validate it doesn't go below cost
    let discountedPrice: number;
    if (type === "percentage") {
      discountedPrice = salePrice * (1 - value / 100);
    } else {
      discountedPrice = salePrice - value;
    }

    if (purchasePrice > 0 && discountedPrice < purchasePrice) {
      return NextResponse.json(
        {
          error: `Скидка снижает цену до ${discountedPrice.toFixed(2)}, что ниже себестоимости ${purchasePrice.toFixed(2)}`,
          discountedPrice,
          purchasePrice,
        },
        { status: 400 }
      );
    }

    // P2-03: discount.create + outbox event are atomic — both inside one transaction.
    const discount = await db.$transaction(async (tx) => {
      const created = await tx.productDiscount.create({
        data: {
          productId,
          name,
          type,
          value,
          validFrom: validFrom ? new Date(validFrom) : new Date(),
          validTo: validTo ? new Date(validTo) : null,
        },
      });

      await createOutboxEvent(
        tx,
        { type: "discount.updated", occurredAt: new Date(), payload: { productId } },
        "ProductDiscount",
        productId
      );

      return created;
    });

    return NextResponse.json(discount, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id: productId } = await params;

    const { searchParams } = new URL(request.url);
    const discountId = searchParams.get("discountId");

    if (!discountId) {
      return NextResponse.json({ error: "discountId обязателен" }, { status: 400 });
    }

    // P2-03: discount.update (deactivate) + outbox event are atomic — both inside one transaction.
    await db.$transaction(async (tx) => {
      await tx.productDiscount.update({
        where: { id: discountId },
        data: { isActive: false },
      });

      await createOutboxEvent(
        tx,
        { type: "discount.updated", occurredAt: new Date(), payload: { productId } },
        "ProductDiscount",
        productId
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

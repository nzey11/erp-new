import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { addToCartSchema } from "@/lib/modules/ecommerce/schemas/cart.schema";

/** GET /api/ecommerce/cart — Get customer cart */
export async function GET() {
  try {
    const customer = await requireCustomer();

    const cartItems = await db.cartItem.findMany({
      where: { customerId: customer.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            slug: true,
            unit: { select: { shortName: true } },
          },
        },
        variant: {
          select: {
            id: true,
            option: { select: { value: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    const items = cartItems.map((item) => ({
      id: item.id,
      productId: item.product.id,
      productName: item.product.name,
      productImageUrl: item.product.imageUrl,
      productSlug: item.product.slug,
      variantId: item.variantId,
      variantOption: item.variant?.option.value || null,
      quantity: item.quantity,
      priceSnapshot: item.priceSnapshot,
      unitShortName: item.product.unit.shortName,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** POST /api/ecommerce/cart — Add or update cart item */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { productId, variantId, quantity } = await parseBody(request, addToCartSchema);

    // Get product with current price
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
        },
        variants: {
          where: { id: variantId || "none" },
          take: 1,
        },
      },
    });

    if (!product || !product.isActive || !product.publishedToStore) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Calculate price
    let price = product.salePrices[0]?.price || 0;
    const discount = product.discounts[0];
    if (discount) {
      price =
        discount.type === "percentage"
          ? price * (1 - discount.value / 100)
          : price - discount.value;
      price = Math.max(0, price);
    }

    // Add variant price adjustment
    if (variantId && product.variants[0]) {
      price += product.variants[0].priceAdjustment;
    }

    price = Math.round(price * 100) / 100;

    // Upsert cart item
    const resolvedVariantId = variantId ?? null;

    let existing;
    if (resolvedVariantId) {
      existing = await db.cartItem.findUnique({
        where: {
          customerId_productId_variantId: {
            customerId: customer.id,
            productId,
            variantId: resolvedVariantId,
          },
        },
      });
    } else {
      existing = await db.cartItem.findFirst({
        where: {
          customerId: customer.id,
          productId,
          variantId: null,
        },
      });
    }

    if (existing) {
      await db.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          priceSnapshot: price,
        },
      });
    } else {
      await db.cartItem.create({
        data: {
          customerId: customer.id,
          productId,
          variantId: resolvedVariantId,
          quantity,
          priceSnapshot: price,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** DELETE /api/ecommerce/cart?itemId=xxx — Remove cart item */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    // Verify ownership
    const item = await db.cartItem.findUnique({
      where: { id: itemId },
      select: { customerId: true },
    });

    if (!item || item.customerId !== customer.id) {
      return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
    }

    await db.cartItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

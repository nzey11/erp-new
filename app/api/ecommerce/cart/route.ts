import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { addToCartSchema } from "@/lib/modules/ecommerce/schemas/cart.schema";
import { CartService, toNumber } from "@/lib/modules/ecommerce";

/** GET /api/ecommerce/cart — Get customer cart */
export async function GET() {
  try {
    const customer = await requireCustomer();

    const cartItems = await CartService.getCartItems(customer.id);

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
    const product = await CartService.getProductForCart(productId, variantId);

    if (!product || !product.isActive || !product.publishedToStore) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Calculate price
    let price = toNumber(product.salePrices[0]?.price);
    const discount = product.discounts[0];
    if (discount) {
      price =
        discount.type === "percentage"
          ? price * (1 - toNumber(discount.value) / 100)
          : price - toNumber(discount.value);
      price = Math.max(0, price);
    }

    // Add variant price adjustment
    if (variantId && product.variants[0]) {
      price += toNumber(product.variants[0].priceAdjustment);
    }

    price = Math.round(price * 100) / 100;

    // Upsert cart item
    const resolvedVariantId = variantId ?? null;

    let existing;
    if (resolvedVariantId) {
      existing = await CartService.findCartItemByVariant(customer.id, productId, resolvedVariantId);
    } else {
      existing = await CartService.findCartItemNoVariant(customer.id, productId);
    }

    if (existing) {
      await CartService.updateCartItem(existing.id, existing.quantity + quantity, price);
    } else {
      await CartService.createCartItem({
        customerId: customer.id,
        productId,
        variantId: resolvedVariantId,
        quantity,
        priceSnapshot: price,
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
    const item = await CartService.findCartItemById(itemId);

    if (!item || item.customerId !== customer.id) {
      return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
    }

    await CartService.deleteCartItem(itemId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { checkoutSchema } from "@/lib/modules/accounting";
import { createSalesOrderFromCart, CartService, toNumber } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";

/** POST /api/ecommerce/checkout — Create order from cart */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { deliveryType, addressId, notes } = await parseBody(request, checkoutSchema);

    // Get cart items with price calculation
    const cartItems = await CartService.getCartItemsForCheckout(customer.id);

    if (cartItems.length === 0) {
      return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
    }

    // Verify all products are still available
    const unavailableProducts = cartItems.filter(
      (item) => !item.product.isActive || !item.product.publishedToStore
    );
    if (unavailableProducts.length > 0) {
      return NextResponse.json(
        { error: "Некоторые товары больше недоступны" },
        { status: 400 }
      );
    }

    // Calculate prices with discounts
    const orderItems = cartItems.map((item) => {
      let price: number = toNumber(item.product.salePrices[0]?.price);
      if (item.variant) price += toNumber(item.variant.priceAdjustment);
      const discount = item.product.discounts[0];
      if (discount) {
        price = discount.type === "percentage" 
          ? price * (1 - toNumber(discount.value) / 100) 
          : price - toNumber(discount.value);
        price = Math.max(0, price);
      }
      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: Math.round(price * 100) / 100,
      };
    });

    // Create sales_order document
    const result = await createSalesOrderFromCart({
      customerId: customer.id,
      items: orderItems,
      deliveryType,
      deliveryAddressId: addressId,
      deliveryCost: 0, // TODO: Add delivery cost calculation
      notes,
    });

    // Clear cart
    await CartService.clearCart(customer.id);

    return NextResponse.json({
      orderId: result.documentId,
      orderNumber: result.documentNumber,
      totalAmount: result.totalAmount,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("checkout", "Checkout failed", error);
    return handleCustomerAuthError(error);
  }
}

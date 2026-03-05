import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { checkoutSchema, createSalesOrderFromCart } from "@/lib/modules/accounting";

/** POST /api/ecommerce/checkout — Create order from cart */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { deliveryType, addressId, notes } = await parseBody(request, checkoutSchema);

    // Get cart items with price calculation
    const cartItems = await db.cartItem.findMany({
      where: { customerId: customer.id },
      include: {
        product: {
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
          },
        },
        variant: true,
      },
    });

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
      let price = item.product.salePrices[0]?.price || 0;
      if (item.variant) price += item.variant.priceAdjustment;
      const discount = item.product.discounts[0];
      if (discount) {
        price = discount.type === "percentage" 
          ? price * (1 - discount.value / 100) 
          : price - discount.value;
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
    await db.cartItem.deleteMany({
      where: { customerId: customer.id },
    });

    return NextResponse.json({
      orderId: result.documentId,
      orderNumber: result.documentNumber,
      totalAmount: result.totalAmount,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Checkout error:", error);
    return handleCustomerAuthError(error);
  }
}

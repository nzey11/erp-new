import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { checkoutSchema } from "@/lib/modules/ecommerce/schemas/checkout.schema";

/** POST /api/ecommerce/checkout — Create order from cart */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { deliveryType, addressId, notes } = await parseBody(request, checkoutSchema);

    // Validate address for courier delivery
    if (deliveryType === "courier" && !addressId) {
      return NextResponse.json(
        { error: "Address is required for courier delivery" },
        { status: 400 }
      );
    }

    // Get cart items
    const cartItems = await db.cartItem.findMany({
      where: { customerId: customer.id },
      include: {
        product: {
          select: { id: true, name: true, isActive: true, publishedToStore: true },
        },
      },
    });

    if (cartItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Verify all products are still available
    const unavailableProducts = cartItems.filter(
      (item) => !item.product.isActive || !item.product.publishedToStore
    );
    if (unavailableProducts.length > 0) {
      return NextResponse.json(
        { error: "Some products are no longer available" },
        { status: 400 }
      );
    }

    // Verify address ownership if provided
    if (addressId) {
      const address = await db.customerAddress.findUnique({
        where: { id: addressId },
        select: { customerId: true },
      });

      if (!address || address.customerId !== customer.id) {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
    }

    // Calculate total
    const itemsTotal = cartItems.reduce(
      (sum, item) => sum + item.priceSnapshot * item.quantity,
      0
    );
    const deliveryCost = deliveryType === "courier" ? 0 : 0; // Add delivery cost logic if needed
    const totalAmount = itemsTotal + deliveryCost;

    // Generate order number
    const orderCounter = await db.orderCounter.upsert({
      where: { prefix: "ORD" },
      create: { prefix: "ORD", lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const orderNumber = `ORD-${String(orderCounter.lastNumber).padStart(6, "0")}`;

    // Create order
    const order = await db.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status: "pending",
        deliveryType,
        deliveryAddressId: addressId || null,
        deliveryCost,
        totalAmount,
        notes: notes || null,
        items: {
          create: cartItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.priceSnapshot,
            total: item.priceSnapshot * item.quantity,
          })),
        },
      },
    });

    // Clear cart
    await db.cartItem.deleteMany({
      where: { customerId: customer.id },
    });

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Checkout error:", error);
    return handleCustomerAuthError(error);
  }
}

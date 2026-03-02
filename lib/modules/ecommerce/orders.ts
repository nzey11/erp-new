import { db } from "@/lib/shared/db";

/** Create order from cart, optionally create ERP document */
export async function createOrder(
  customerId: string,
  deliveryType: "pickup" | "courier",
  deliveryAddressId: string | null,
  notes: string | null
) {
  // Get cart items
  const cartItems = await db.cartItem.findMany({
    where: { customerId },
    include: {
      product: {
        include: {
          salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: "desc" }, take: 1 },
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
    throw new Error("Корзина пуста");
  }

  // Generate order number
  const orderNumber = await generateOrderNumber();

  // Calculate totals
  let totalAmount = 0;
  const orderItemsData = cartItems.map((item) => {
    let price = item.product.salePrices[0]?.price || 0;
    if (item.variant) price += item.variant.priceAdjustment;
    const discount = item.product.discounts[0];
    if (discount) {
      price = discount.type === "percentage" ? price * (1 - discount.value / 100) : price - discount.value;
      price = Math.max(0, price);
    }
    const total = Math.round(price * item.quantity * 100) / 100;
    totalAmount += total;
    return {
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      price: Math.round(price * 100) / 100,
      total,
    };
  });

  totalAmount = Math.round(totalAmount * 100) / 100;

  // Create order in transaction
  const order = await db.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        deliveryType,
        deliveryAddressId,
        totalAmount,
        notes,
        items: {
          create: orderItemsData,
        },
      },
      include: { items: true },
    });

    // Clear cart
    await tx.cartItem.deleteMany({ where: { customerId } });

    return newOrder;
  });

  return order;
}

/** Confirm order payment — create ERP document and update stock */
export async function confirmOrderPayment(orderId: string, paymentExternalId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true },
  });

  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") return order;

  // Import document helpers
  const { generateDocumentNumber } = await import("@/lib/modules/accounting/documents");

  const docNumber = await generateDocumentNumber("sales_order");

  const updated = await db.$transaction(async (tx) => {
    // Update order
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "paid",
        status: "processing",
        paymentExternalId,
        paidAt: new Date(),
      },
    });

    // Create ERP sales_order document
    const doc = await tx.document.create({
      data: {
        number: docNumber,
        type: "sales_order",
        status: "confirmed",
        totalAmount: order.totalAmount,
        confirmedAt: new Date(),
        description: `Заказ интернет-магазина ${order.orderNumber}`,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
          })),
        },
      },
    });

    // Link order to document
    await tx.order.update({
      where: { id: orderId },
      data: { documentId: doc.id },
    });

    return updatedOrder;
  });

  return updated;
}

/** Cancel order */
export async function cancelOrder(orderId: string, customerId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
  });

  if (!order) throw new Error("Order not found");
  if (order.customerId !== customerId) throw new Error("Access denied");
  if (order.status === "shipped" || order.status === "delivered") {
    throw new Error("Cannot cancel shipped or delivered order");
  }

  return db.order.update({
    where: { id: orderId },
    data: {
      status: "cancelled",
      updatedAt: new Date(),
    },
  });
}

/** Generate next order number */
async function generateOrderNumber(): Promise<string> {
  const counter = await db.orderCounter.upsert({
    where: { prefix: "ORD" },
    create: { prefix: "ORD", lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `ORD-${String(counter.lastNumber).padStart(6, "0")}`;
}

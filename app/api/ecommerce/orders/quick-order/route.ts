import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { parseBody, validationError } from "@/lib/shared/validation";
import { quickOrderSchema } from "@/lib/modules/ecommerce/schemas/quick-order.schema";

export async function POST(request: NextRequest) {
  try {
    const data = await parseBody(request, quickOrderSchema);

    // Validate product exists and is published
    const product = await db.product.findFirst({
      where: {
        id: data.productId,
        isActive: true,
        publishedToStore: true,
      },
      include: {
        salePrices: {
          where: {
            isActive: true,
            priceListId: null,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
          orderBy: { validFrom: "desc" },
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
    });

    if (!product) {
      return NextResponse.json(
        { error: "Товар не найден или недоступен" },
        { status: 404 }
      );
    }

    // Calculate price
    let price = product.salePrices[0]?.price || 0;
    const discount = product.discounts[0];
    if (discount) {
      if (discount.type === "percentage") {
        price = price * (1 - discount.value / 100);
      } else {
        price = Math.max(0, price - discount.value);
      }
    }

    // Add variant adjustment
    if (data.variantId) {
      const variant = await db.productVariant.findUnique({
        where: { id: data.variantId },
      });
      if (variant) {
        price += variant.priceAdjustment;
      }
    }

    price = Math.round(price * 100) / 100;
    const quantity = data.quantity;
    const totalAmount = Math.round(price * quantity * 100) / 100;

    // Generate order number
    const counter = await db.orderCounter.upsert({
      where: { prefix: "ORD" },
      create: { prefix: "ORD", lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const orderNumber = `ORD-${String(counter.lastNumber).padStart(6, "0")}`;

    // Find or create a guest customer placeholder
    // Use phone as identifier for quick orders
    let customer = await db.customer.findFirst({
      where: { phone: data.customerPhone },
    });

    if (!customer) {
      customer = await db.customer.create({
        data: {
          telegramId: `quick_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: data.customerName,
          phone: data.customerPhone,
        },
      });
    }

    // Create order
    const order = await db.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status: "pending",
        deliveryType: "pickup",
        totalAmount,
        notes: data.notes
          ? `[Быстрый заказ] ${data.customerName}, ${data.customerPhone}\n${data.notes}`
          : `[Быстрый заказ] ${data.customerName}, ${data.customerPhone}`,
        items: {
          create: {
            productId: data.productId,
            variantId: data.variantId || null,
            quantity,
            price,
            total: totalAmount,
          },
        },
      },
    });

    return NextResponse.json({
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Quick order error:", error);
    return NextResponse.json(
      { error: "Не удалось создать заказ" },
      { status: 500 }
    );
  }
}

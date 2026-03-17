import { NextRequest, NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { parseBody, validationError } from "@/lib/shared/validation";
import { quickOrderSchema } from "@/lib/modules/ecommerce/schemas/quick-order.schema";
import { createSalesOrderFromCart } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";
import { resolveParty } from "@/lib/domain/party";

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
    let price: number = toNumber(product.salePrices[0]?.price) || 0;
    const discount = product.discounts[0];
    if (discount) {
      if (discount.type === "percentage") {
        price = price * (1 - toNumber(discount.value) / 100);
      } else {
        price = Math.max(0, price - toNumber(discount.value));
      }
    }

    // Add variant adjustment
    if (data.variantId) {
      const variant = await db.productVariant.findUnique({
        where: { id: data.variantId },
      });
      if (variant) {
        price += toNumber(variant.priceAdjustment);
      }
    }

    price = Math.round(price * 100) / 100;
    const quantity = data.quantity;

    // Find or create a guest customer by phone
    let customer = await db.customer.findFirst({
      where: { phone: data.customerPhone },
    });

    const isNewCustomer = !customer;

    if (!customer) {
      customer = await db.customer.create({
        data: {
          telegramId: `quick_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: data.customerName,
          phone: data.customerPhone,
        },
      });
    }

    // P2-05: Ensure every new guest Customer has a Party mirror at creation time.
    // resolveParty() is not transaction-aware (uses global db client internally);
    // it cannot share a db.$transaction() with db.customer.create().
    // Per roadmap: failure must not fail the order flow — log and continue (Party can be backfilled).
    if (isNewCustomer) {
      try {
        await resolveParty({ customerId: customer.id });
      } catch (partyError) {
        logger.error(
          "quick-order",
          "Party mirror creation failed for new guest Customer — will be backfilled",
          { customerId: customer.id, error: partyError }
        );
        // Intentionally not re-throwing: order must proceed even if Party creation fails.
      }
    }

    // Create Document (sales_order) via ERP module
    const notes = data.notes
      ? `[Быстрый заказ] ${data.customerName}, ${data.customerPhone}\n${data.notes}`
      : `[Быстрый заказ] ${data.customerName}, ${data.customerPhone}`;

    const result = await createSalesOrderFromCart({
      customerId: customer.id,
      items: [{
        productId: data.productId,
        variantId: data.variantId || null,
        quantity,
        price,
      }],
      deliveryType: "pickup",
      deliveryCost: 0,
      notes,
    });

    return NextResponse.json({
      orderNumber: result.documentNumber,
      totalAmount: result.totalAmount,
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("quick-order", "Quick order failed", error);
    return NextResponse.json(
      { error: "Не удалось создать заказ" },
      { status: 500 }
    );
  }
}

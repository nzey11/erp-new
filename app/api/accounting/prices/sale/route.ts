import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createSalePriceSchema, querySalePricesSchema } from "@/lib/modules/accounting/schemas/prices.schema";
import { createOutboxEvent } from "@/lib/events/outbox";
import { PriceService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("pricing:read");

    const query = parseQuery(request, querySalePricesSchema);
    
    const prices = await PriceService.listSalePrices({
      productId: query.productId,
      priceListId: query.priceListId,
      active: query.active,
    });

    return NextResponse.json(prices);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("pricing:write");

    const data = await parseBody(request, createSalePriceSchema);

    // P-price: salePrice.create + outbox event are atomic — both inside one transaction.
    const salePrice = await PriceService.$transaction(async (tx) => {
      const created = await PriceService.createSalePrice(
        {
          productId: data.productId,
          priceListId: data.priceListId || null,
          price: data.price,
          currency: data.currency,
          validFrom: data.validFrom,
          validTo: data.validTo ?? undefined,
        },
        tx
      );

      await createOutboxEvent(
        tx,
        { type: "sale_price.updated", occurredAt: new Date(), payload: { productId: data.productId } },
        "SalePrice",
        data.productId
      );

      return created;
    });

    return NextResponse.json(salePrice, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createSalePriceSchema, querySalePricesSchema } from "@/lib/modules/accounting/schemas/prices.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("pricing:read");

    const query = parseQuery(request, querySalePricesSchema);
    
    const activeOnly = query.active !== "false";

    const where: Record<string, unknown> = {};
    if (query.productId) where.productId = query.productId;
    if (query.priceListId) where.priceListId = query.priceListId;
    if (activeOnly) where.isActive = true;

    const prices = await db.salePrice.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        priceList: { select: { id: true, name: true } },
      },
      orderBy: { validFrom: "desc" },
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

    const salePrice = await db.salePrice.create({
      data: {
        productId: data.productId,
        priceListId: data.priceListId || null,
        price: data.price,
        currency: data.currency,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        product: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(salePrice, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

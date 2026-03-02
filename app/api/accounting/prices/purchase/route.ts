import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createPurchasePriceSchema, queryPurchasePricesSchema } from "@/lib/modules/accounting/schemas/prices.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("pricing:read");

    const query = parseQuery(request, queryPurchasePricesSchema);
    
    const activeOnly = query.active !== "false";

    const where: Record<string, unknown> = {};
    if (query.productId) where.productId = query.productId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (activeOnly) where.isActive = true;

    const prices = await db.purchasePrice.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
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

    const data = await parseBody(request, createPurchasePriceSchema);

    const purchasePrice = await db.purchasePrice.create({
      data: {
        productId: data.productId,
        supplierId: data.supplierId || null,
        price: data.price,
        currency: data.currency,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(purchasePrice, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

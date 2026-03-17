import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createPurchasePriceSchema, queryPurchasePricesSchema } from "@/lib/modules/accounting/schemas/prices.schema";
import { PriceService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("pricing:read");

    const query = parseQuery(request, queryPurchasePricesSchema);
    
    const prices = await PriceService.listPurchasePrices({
      productId: query.productId,
      supplierId: query.supplierId,
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

    const data = await parseBody(request, createPurchasePriceSchema);

    const purchasePrice = await PriceService.createPurchasePrice({
      productId: data.productId,
      supplierId: data.supplierId || null,
      price: data.price,
      currency: data.currency,
      validFrom: data.validFrom,
      validTo: data.validTo ?? undefined,
    });

    return NextResponse.json(purchasePrice, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

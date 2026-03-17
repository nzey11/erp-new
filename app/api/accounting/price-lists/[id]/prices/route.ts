import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { addPriceListPriceSchema } from "@/lib/modules/accounting/schemas/prices.schema";
import { PriceService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:read");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const priceList = await PriceService.findPriceListGate(id);
    if (!priceList) {
      return NextResponse.json({ error: "Прайс-лист не найден" }, { status: 404 });
    }

    const prices = await PriceService.listPriceListPrices(id, search);

    return NextResponse.json({ priceList, prices });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;

    const data = await parseBody(request, addPriceListPriceSchema);

    // Check if price list exists
    const priceList = await PriceService.findPriceListGate(id);
    if (!priceList) {
      return NextResponse.json({ error: "Прайс-лист не найден" }, { status: 404 });
    }

    // Check if product exists
    const product = await PriceService.findProductGate(data.productId);
    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Check for existing active price for this product in this price list
    const existingPrice = await PriceService.findExistingPriceListPrice(id, data.productId);

    if (existingPrice) {
      // Update existing price
      const updated = await PriceService.updatePriceListPrice(existingPrice.id, {
        price: data.price,
        validFrom: data.validFrom,
        validTo: data.validTo ?? undefined,
      });
      return NextResponse.json(updated);
    }

    // Create new price
    const price = await PriceService.createPriceListPrice({
      productId: data.productId,
      priceListId: id,
      price: data.price,
      validFrom: data.validFrom,
      validTo: data.validTo ?? undefined,
    });

    return NextResponse.json(price, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const priceId = searchParams.get("priceId");

    if (!priceId) {
      return NextResponse.json({ error: "ID цены обязателен" }, { status: 400 });
    }

    await PriceService.softDeletePriceListPrice(priceId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

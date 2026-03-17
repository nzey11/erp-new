import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updatePriceListSchema } from "@/lib/modules/accounting/schemas/prices.schema";
import { PriceService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:read");
    const { id } = await params;

    const priceList = await PriceService.findPriceListById(id);

    if (!priceList) {
      return NextResponse.json({ error: "Прайс-лист не найден" }, { status: 404 });
    }

    return NextResponse.json(priceList);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;
    
    const data = await parseBody(request, updatePriceListSchema);

    const priceList = await PriceService.updatePriceList(id, {
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    });

    return NextResponse.json(priceList);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;

    await PriceService.softDeletePriceList(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updatePriceListSchema } from "@/lib/modules/accounting/schemas/prices.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:read");
    const { id } = await params;

    const priceList = await db.priceList.findUnique({
      where: { id },
      include: {
        prices: {
          where: { isActive: true },
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { product: { name: "asc" } },
        },
      },
    });

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

    const priceList = await db.priceList.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
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

    await db.priceList.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

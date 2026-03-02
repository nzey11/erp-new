import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createPriceListSchema } from "@/lib/modules/accounting/schemas/prices.schema";

export async function GET() {
  try {
    await requirePermission("pricing:read");

    const priceLists = await db.priceList.findMany({
      where: { isActive: true },
      include: { _count: { select: { prices: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(priceLists);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("pricing:write");

    const data = await parseBody(request, createPriceListSchema);

    const priceList = await db.priceList.create({
      data: { name: data.name, description: data.description || null },
    });

    return NextResponse.json(priceList, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

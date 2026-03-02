import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantTypeSchema } from "@/lib/modules/accounting/schemas/variant-types.schema";

export async function GET() {
  try {
    await requirePermission("products:read");

    const types = await db.variantType.findMany({
      where: { isActive: true },
      include: {
        options: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(types);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, createVariantTypeSchema);

    const maxOrder = await db.variantType.aggregate({ _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const variantType = await db.variantType.create({
      data: { name: data.name, order: nextOrder },
      include: { options: true },
    });

    return NextResponse.json(variantType, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

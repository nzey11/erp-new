import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantOptionSchema } from "@/lib/modules/accounting/schemas/variant-types.schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id: variantTypeId } = await params;
    const data = await parseBody(request, createVariantOptionSchema);

    const maxOrder = await db.variantOption.aggregate({
      where: { variantTypeId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const option = await db.variantOption.create({
      data: { variantTypeId, value: data.value, order: nextOrder },
    });

    return NextResponse.json(option, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    await params; // consume params

    const { searchParams } = new URL(request.url);
    const optionId = searchParams.get("optionId");

    if (!optionId) {
      return NextResponse.json({ error: "optionId обязателен" }, { status: 400 });
    }

    await db.variantOption.delete({ where: { id: optionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

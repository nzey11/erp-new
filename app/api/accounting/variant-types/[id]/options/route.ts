import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantOptionSchema } from "@/lib/modules/accounting/schemas/variant-types.schema";
import { VariantTypeService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id: variantTypeId } = await params;
    const data = await parseBody(request, createVariantOptionSchema);
    const option = await VariantTypeService.createOption(variantTypeId, data.value);
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

    await VariantTypeService.deleteOption(optionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

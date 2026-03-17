import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateVariantTypeSchema } from "@/lib/modules/accounting/schemas/variant-types.schema";
import { VariantTypeService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id } = await params;
    const data = await parseBody(request, updateVariantTypeSchema);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.order !== undefined) updateData.order = data.order;

    const variantType = await VariantTypeService.update(id, updateData);
    return NextResponse.json(variantType);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id } = await params;
    await VariantTypeService.softDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateCustomFieldSchema } from "@/lib/modules/accounting/schemas/custom-fields.schema";
import { CustomFieldService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id } = await params;
    const data = await parseBody(request, updateCustomFieldSchema);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.fieldType !== undefined) updateData.fieldType = data.fieldType;
    if (data.options !== undefined) updateData.options = Array.isArray(data.options) ? JSON.stringify(data.options) : data.options;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.order !== undefined) updateData.order = data.order;

    const field = await CustomFieldService.update(id, updateData);
    return NextResponse.json(field);
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
    await CustomFieldService.softDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

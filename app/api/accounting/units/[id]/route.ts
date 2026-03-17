import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateUnitSchema } from "@/lib/modules/accounting/schemas/units.schema";
import { UnitService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("units:write");
    const { id } = await params;
    const data = await parseBody(request, updateUnitSchema);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.shortName !== undefined) updateData.shortName = data.shortName;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const unit = await UnitService.update(id, updateData);
    return NextResponse.json(unit);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("units:write");
    const { id } = await params;
    await UnitService.softDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

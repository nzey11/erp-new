import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createUnitSchema } from "@/lib/modules/accounting/schemas/units.schema";
import { UnitService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    await requirePermission("units:read");
    const units = await UnitService.list();
    return NextResponse.json(units);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("units:write");
    const data = await parseBody(request, createUnitSchema);
    const unit = await UnitService.create({ name: data.name, shortName: data.shortName });
    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createUnitSchema } from "@/lib/modules/accounting/schemas/units.schema";

export async function GET() {
  try {
    await requirePermission("units:read");

    const units = await db.unit.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(units);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("units:write");

    const data = await parseBody(request, createUnitSchema);

    const unit = await db.unit.create({
      data: { name: data.name, shortName: data.shortName },
    });

    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

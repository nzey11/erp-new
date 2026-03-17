import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createWarehouseSchema } from "@/lib/modules/accounting/schemas/warehouses.schema";
import { WarehouseService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("warehouses:read");

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const warehouses = await WarehouseService.list(session.tenantId, active);

    return NextResponse.json(warehouses);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("warehouses:write");

    const data = await parseBody(request, createWarehouseSchema);

    const warehouse = await WarehouseService.create({
      tenantId: session.tenantId,
      name: data.name,
      address: data.address || null,
      responsibleName: data.responsibleName || null,
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

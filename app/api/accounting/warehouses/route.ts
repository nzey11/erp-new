import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createWarehouseSchema } from "@/lib/modules/accounting/schemas/warehouses.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("warehouses:read");

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const where: Record<string, unknown> = {};
    if (active !== null && active !== "") where.isActive = active === "true";

    const warehouses = await db.warehouse.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("warehouses:write");

    const data = await parseBody(request, createWarehouseSchema);

    const warehouse = await db.warehouse.create({
      data: { name: data.name, address: data.address || null, responsibleName: data.responsibleName || null },
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

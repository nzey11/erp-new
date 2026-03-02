import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateWarehouseSchema } from "@/lib/modules/accounting/schemas/warehouses.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("warehouses:read");
    const { id } = await params;

    const warehouse = await db.warehouse.findUnique({
      where: { id },
      include: {
        stockRecords: {
          where: { quantity: { not: 0 } },
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { product: { name: "asc" } },
        },
      },
    });

    if (!warehouse) {
      return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
    }

    return NextResponse.json(warehouse);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("warehouses:write");
    const { id } = await params;
    const data = await parseBody(request, updateWarehouseSchema);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.responsibleName !== undefined) updateData.responsibleName = data.responsibleName || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const warehouse = await db.warehouse.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(warehouse);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("warehouses:write");
    const { id } = await params;

    await db.warehouse.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

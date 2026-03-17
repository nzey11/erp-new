import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateWarehouseSchema } from "@/lib/modules/accounting/schemas/warehouses.schema";
import { WarehouseService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("warehouses:read");
    const { id } = await params;

    const warehouse = await WarehouseService.findById(id, session.tenantId);

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
    const session = await requirePermission("warehouses:write");
    const { id } = await params;
    const data = await parseBody(request, updateWarehouseSchema);

    // Verify warehouse belongs to tenant
    const existing = await WarehouseService.getTenantGate(id, session.tenantId);

    if (!existing) {
      return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.responsibleName !== undefined) updateData.responsibleName = data.responsibleName || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const warehouse = await WarehouseService.update(id, updateData);

    return NextResponse.json(warehouse);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("warehouses:write");
    const { id } = await params;

    // Verify warehouse belongs to tenant
    const existing = await WarehouseService.getTenantGate(id, session.tenantId);

    if (!existing) {
      return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
    }

    await WarehouseService.softDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

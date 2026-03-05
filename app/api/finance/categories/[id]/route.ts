import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth } from "@/lib/shared/authorization";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  defaultAccountCode: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = updateCategorySchema.parse(body);

    const existing = await db.financeCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // System categories: only defaultAccountCode can be updated, not name
    if (existing.isSystem && data.name) {
      return NextResponse.json({ error: "Cannot rename system category" }, { status: 403 });
    }

    const updated = await db.financeCategory.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.defaultAccountCode !== undefined ? { defaultAccountCode: data.defaultAccountCode } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.financeCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json({ error: "Cannot delete system category" }, { status: 403 });
    }

    // Check if used by payments
    const usedCount = await db.payment.count({ where: { categoryId: id } });
    if (usedCount > 0) {
      return NextResponse.json({ error: "Category is used by payments" }, { status: 409 });
    }

    await db.financeCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

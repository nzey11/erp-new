import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth } from "@/lib/shared/authorization";
import { z } from "zod";

const updatePaymentSchema = z.object({
  categoryId: z.string().min(1).optional(),
  counterpartyId: z.string().optional().nullable(),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(["cash", "bank_transfer", "card"]).optional(),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = updatePaymentSchema.parse(body);

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.payment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

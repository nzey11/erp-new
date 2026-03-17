import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { z } from "zod";
import { PaymentService } from "@/lib/modules/finance";
import { revalidatePath } from "next/cache";

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
    const session = await requirePermission("payments:write");
    const { id } = await params;
    const body = await request.json();
    const data = updatePaymentSchema.parse(body);

    const updated = await PaymentService.updatePayment(id, session.tenantId, data);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return handleAuthError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("payments:write");
    const { id } = await params;

    const result = await PaymentService.deletePayment(id, session.tenantId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Invalidate all finance report pages so they show updated data
    revalidatePath("/finance", "layout");
    revalidatePath("/reports");
    revalidatePath("/balances");
    revalidatePath("/payments");
    revalidatePath("/finance/journal");
    revalidatePath("/finance/cash-flow");
    revalidatePath("/finance/profit-loss");
    revalidatePath("/finance/balance-sheet");
    if (result.counterpartyId) {
      revalidatePath("/counterparties");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

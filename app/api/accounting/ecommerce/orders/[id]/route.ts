import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateOrderStatusSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:write");

    const { id } = await params;
    const data = await parseBody(request, updateOrderStatusSchema);

    const updateData: Record<string, unknown> = { status: data.status };

    // Set timestamps based on status
    if (data.status === "paid") {
      updateData.paidAt = new Date();
    } else if (data.status === "shipped") {
      updateData.shippedAt = new Date();
    } else if (data.status === "delivered") {
      updateData.deliveredAt = new Date();
    }

    const order = await db.order.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            telegramUsername: true,
          },
        },
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

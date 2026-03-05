import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateOrderStatusSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";
import { updateOrderStatus } from "@/lib/modules/accounting/ecom-orders";

/** PUT /api/accounting/ecommerce/orders/[id] — Update ecom order status */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:write");

    const { id } = await params;
    const data = await parseBody(request, updateOrderStatusSchema);

    // Map old status names to Document operations
    if (data.status === "shipped" || data.status === "delivered") {
      await updateOrderStatus(id, data.status);
    } else if (data.status === "paid") {
      // Payment confirmation should use /confirm-payment endpoint
      // But for backwards compatibility:
      await db.document.update({
        where: { id },
        data: {
          paymentStatus: "paid",
          paidAt: new Date(),
          status: "confirmed",
          confirmedAt: new Date(),
        },
      });
    } else if (data.status === "cancelled") {
      await db.document.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      });
    } else if (data.status === "draft" || data.status === "confirmed") {
      // Direct DocumentStatus values
      await db.document.update({
        where: { id },
        data: { status: data.status },
      });
    } else {
      // Unknown status
      return NextResponse.json(
        { error: `Unknown status: ${data.status}` },
        { status: 400 }
      );
    }

    const document = await db.document.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            telegramUsername: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
            variant: {
              select: {
                id: true,
                option: {
                  select: {
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

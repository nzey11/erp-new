import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getAllEcomOrders } from "@/lib/modules/ecom/orders";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryEcomOrdersSchema } from "@/lib/modules/accounting/schemas/ecom-order.schema";

/** GET /api/accounting/ecommerce/orders — Get all e-commerce orders (from Document) */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");

    const { status, paymentStatus, search, page, limit } = parseQuery(request, queryEcomOrdersSchema);

    const result = await getAllEcomOrders({
      status,
      paymentStatus,
      search,
      page,
      limit,
    });

    // Transform Document to match old Order API format for backwards compatibility
    const orders = result.documents.map((doc) => ({
      id: doc.id,
      orderNumber: doc.number,
      status: doc.status,
      deliveryType: doc.deliveryType,
      totalAmount: doc.totalAmount,
      deliveryCost: doc.deliveryCost,
      paymentMethod: doc.paymentMethod,
      paymentStatus: doc.paymentStatus,
      createdAt: doc.createdAt,
      paidAt: doc.paidAt,
      shippedAt: doc.shippedAt,
      deliveredAt: doc.deliveredAt,
      customer: doc.customer,
      items: doc.items.map((item) => ({
        id: item.id,
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      deliveryAddress: doc.deliveryAddress,
    }));

    return NextResponse.json({ orders, total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

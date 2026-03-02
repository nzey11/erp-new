import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryCustomerOrdersSchema } from "@/lib/modules/ecommerce/schemas/products.schema";

/** GET /api/ecommerce/orders — Get customer orders */
export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { limit = 20, page = 1 } = parseQuery(request, queryCustomerOrdersSchema);

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where: { customerId: customer.id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                  slug: true,
                },
              },
              variant: {
                select: {
                  id: true,
                  option: { select: { value: true } },
                },
              },
            },
          },
          deliveryAddress: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.order.count({ where: { customerId: customer.id } }),
    ]);

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      totalAmount: order.totalAmount,
      deliveryCost: order.deliveryCost,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        productImageUrl: item.product.imageUrl,
        productSlug: item.product.slug,
        variantOption: item.variant?.option.value || null,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      deliveryAddress: order.deliveryAddress
        ? {
            id: order.deliveryAddress.id,
            recipientName: order.deliveryAddress.recipientName,
            phone: order.deliveryAddress.phone,
            city: order.deliveryAddress.city,
            street: order.deliveryAddress.street,
            building: order.deliveryAddress.building,
            apartment: order.deliveryAddress.apartment,
          }
        : null,
    }));

    return NextResponse.json({ orders: formattedOrders, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

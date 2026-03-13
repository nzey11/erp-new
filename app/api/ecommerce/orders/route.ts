import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryCustomerOrdersSchema } from "@/lib/modules/ecommerce/schemas/products.schema";
import { getCustomerOrders } from "@/lib/modules/ecom/orders";

/** GET /api/ecommerce/orders — Get customer orders (from Document) */
export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { limit = 20, page = 1 } = parseQuery(request, queryCustomerOrdersSchema);

    // Get orders as Document (sales_order)
    const documents = await getCustomerOrders(customer.id);

    // Paginate results
    const total = documents.length;
    const paginatedDocs = documents.slice((page - 1) * limit, page * limit);

    const formattedOrders = paginatedDocs.map((doc) => ({
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
      items: doc.items.map((item) => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        productImageUrl: item.product.imageUrl,
        productSlug: null, // slug not in select
        variantOption: item.variant?.option.value || null,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      deliveryAddress: doc.deliveryAddress
        ? {
            id: doc.deliveryAddress.id,
            recipientName: doc.deliveryAddress.recipientName,
            phone: doc.deliveryAddress.phone,
            city: doc.deliveryAddress.city,
            street: doc.deliveryAddress.street,
            building: doc.deliveryAddress.building,
            apartment: doc.deliveryAddress.apartment,
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

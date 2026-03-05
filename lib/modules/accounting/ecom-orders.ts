/**
 * E-commerce Orders Module (Accounting)
 * 
 * Customer orders are stored as Document (type: sales_order) in ERP.
 * This module provides helpers for e-commerce checkout flow.
 */

import { db } from "@/lib/shared/db";
import { generateDocumentNumber } from "./documents";
import type { DocumentStatus } from "@/lib/generated/prisma/client";

// Types for e-commerce orders
export type DeliveryType = "pickup" | "courier";
export type PaymentMethod = "tochka" | "cash";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// Order item from cart
interface CartItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  price: number;
}

/**
 * Get or create Counterparty for Customer
 * Called when customer places first order
 */
export async function getOrCreateCounterparty(customerId: string): Promise<string> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { counterparty: true },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  // Return existing counterparty
  if (customer.counterpartyId && customer.counterparty) {
    return customer.counterpartyId;
  }

  // Create new counterparty
  const counterparty = await db.counterparty.create({
    data: {
      type: "customer",
      name: customer.name || `Клиент Telegram`,
      phone: customer.phone,
      email: customer.email,
      notes: `Telegram: @${customer.telegramUsername || customer.telegramId}`,
    },
  });

  // Link customer to counterparty
  await db.customer.update({
    where: { id: customerId },
    data: { counterpartyId: counterparty.id },
  });

  return counterparty.id;
}

/**
 * Create sales_order document from cart
 * Called during checkout
 */
export async function createSalesOrderFromCart(params: {
  customerId: string;
  items: CartItemInput[];
  deliveryType: DeliveryType;
  deliveryAddressId?: string | null;
  deliveryCost?: number;
  notes?: string | null;
}): Promise<{
  documentId: string;
  documentNumber: string;
  totalAmount: number;
}> {
  const { customerId, items, deliveryType, deliveryAddressId, deliveryCost = 0, notes } = params;

  // Validate cart is not empty
  if (items.length === 0) {
    throw new Error("Корзина пуста");
  }

  // Validate address for courier delivery
  if (deliveryType === "courier" && !deliveryAddressId) {
    throw new Error("Адрес доставки обязателен для курьерской доставки");
  }

  // Verify address ownership if provided
  if (deliveryAddressId) {
    const address = await db.customerAddress.findUnique({
      where: { id: deliveryAddressId },
      select: { customerId: true },
    });

    if (!address || address.customerId !== customerId) {
      throw new Error("Invalid delivery address");
    }
  }

  // Get or create counterparty for customer
  const counterpartyId = await getOrCreateCounterparty(customerId);

  // Calculate totals
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = Math.round((itemsTotal + deliveryCost) * 100) / 100;

  // Generate document number (uses ERP numbering: ЗК-00001)
  const documentNumber = await generateDocumentNumber("sales_order");

  // Create document in transaction
  const document = await db.$transaction(async (tx) => {
    // Create sales_order document
    const doc = await tx.document.create({
      data: {
        number: documentNumber,
        type: "sales_order",
        status: "draft",
        counterpartyId,
        customerId,
        deliveryType,
        deliveryAddressId: deliveryAddressId || null,
        deliveryCost,
        totalAmount,
        paymentStatus: "pending",
        notes: notes || null,
        description: `Заказ интернет-магазина ${documentNumber}`,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            price: item.price,
            total: Math.round(item.price * item.quantity * 100) / 100,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return doc;
  });

  return {
    documentId: document.id,
    documentNumber: document.number,
    totalAmount: document.totalAmount,
  };
}

/**
 * Confirm order payment
 * Called when payment is received (webhook from payment provider)
 */
export async function confirmOrderPayment(params: {
  documentId: string;
  paymentExternalId: string;
  paymentMethod: PaymentMethod;
}): Promise<void> {
  const { documentId, paymentExternalId, paymentMethod } = params;

  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  if (document.type !== "sales_order") {
    throw new Error("Document is not a sales order");
  }

  if (document.paymentStatus === "paid") {
    return; // Already paid, idempotent
  }

  await db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: {
        paymentStatus: "paid",
        paymentMethod,
        paymentExternalId,
        paidAt: new Date(),
        status: "confirmed",
        confirmedAt: new Date(),
      },
    });
  });
}

/**
 * Get customer orders (sales_order documents)
 */
export async function getCustomerOrders(customerId: string) {
  return db.document.findMany({
    where: {
      type: "sales_order",
      customerId,
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              imageUrl: true,
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
      deliveryAddress: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get order by ID for customer (with access control)
 */
export async function getCustomerOrder(documentId: string, customerId: string) {
  const document = await db.document.findFirst({
    where: {
      id: documentId,
      customerId,
      type: "sales_order",
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              imageUrl: true,
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
      deliveryAddress: true,
      counterparty: {
        select: {
          name: true,
        },
      },
    },
  });

  return document;
}

/**
 * Cancel order (if not shipped yet)
 */
export async function cancelOrder(documentId: string, customerId: string): Promise<void> {
  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Order not found");
  }

  if (document.customerId !== customerId) {
    throw new Error("Access denied");
  }

  if (document.shippedAt || document.deliveredAt) {
    throw new Error("Cannot cancel shipped or delivered order");
  }

  if (document.status === "cancelled") {
    return; // Already cancelled, idempotent
  }

  await db.document.update({
    where: { id: documentId },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      paymentStatus: document.paymentStatus === "paid" ? "refunded" : document.paymentStatus,
    },
  });
}

/**
 * Update order status (for admin)
 */
export async function updateOrderStatus(
  documentId: string,
  status: "shipped" | "delivered"
): Promise<void> {
  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Order not found");
  }

  if (document.type !== "sales_order") {
    throw new Error("Document is not a sales order");
  }

  const updateData: Record<string, unknown> = {};

  if (status === "shipped") {
    updateData.status = "shipped";
    updateData.shippedAt = new Date();
  } else if (status === "delivered") {
    updateData.status = "delivered";
    updateData.deliveredAt = new Date();
  }

  await db.document.update({
    where: { id: documentId },
    data: updateData,
  });
}

/**
 * Get all e-commerce orders (for admin)
 */
export async function getAllEcomOrders(params?: {
  status?: DocumentStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { status, paymentStatus, search, page = 1, limit = 50 } = params || {};

  const where = {
    type: "sales_order" as const,
    ...(status && { status }),
    ...(paymentStatus && { paymentStatus }),
    ...(search && {
      OR: [
        { number: { contains: search, mode: "insensitive" as const } },
        { customer: { name: { contains: search, mode: "insensitive" as const } } },
        { customer: { phone: { contains: search, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [documents, total] = await Promise.all([
    db.document.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
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
        deliveryAddress: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.document.count({ where }),
  ]);

  return { documents, total, page, limit };
}

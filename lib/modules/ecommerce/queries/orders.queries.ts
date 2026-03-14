/**
 * Orders Queries.
 *
 * Read-only queries for e-commerce orders.
 * No writes allowed in this module.
 */

import { db } from "@/lib/shared/db";
import type { DocumentStatus } from "@/lib/generated/prisma/client";
import type { PaymentStatus } from "../types";

/**
 * Get customer orders (sales_order documents).
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
 * Get order by ID for customer (with access control).
 */
export async function getCustomerOrder(documentId: string, customerId: string) {
  return db.document.findFirst({
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
}

/**
 * Get all e-commerce orders (admin).
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

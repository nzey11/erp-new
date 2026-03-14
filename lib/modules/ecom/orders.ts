/**
 * Ecom domain — order lifecycle operations.
 *
 * This module bridges the storefront/ecommerce context to the ERP document
 * model. It owns the full lifecycle of a customer-facing sales_order:
 * checkout creation, payment confirmation, status updates, cancellation,
 * and admin queries.
 *
 * Phase 1.4: moved from lib/modules/accounting/ecom-orders.ts
 * Import path changed to @/lib/modules/ecom/orders
 */

import { db } from "@/lib/shared/db";
import { generateDocumentNumber } from "@/lib/modules/accounting/documents";
import {
  validateTransition,
  DocumentStateError,
} from "@/lib/modules/accounting/document-states";
import type { DocumentStatus } from "@/lib/generated/prisma/client";
import { recordOrderPlaced, recordPaymentReceived } from "@/lib/party";
import {
  confirmDocumentTransactional,
  cancelDocumentTransactional,
  type ConfirmedDocumentResult,
  type CancelledDocumentResult,
} from "@/lib/modules/accounting/services/document-confirm.service";

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
 * Get or create Counterparty for Customer.
 * Called when customer places their first order.
 */
export async function getOrCreateCounterparty(customerId: string): Promise<string> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { counterparty: true },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.counterpartyId && customer.counterparty) {
    return customer.counterpartyId;
  }

  const counterparty = await db.counterparty.create({
    data: {
      type: "customer",
      name: customer.name || `Клиент Telegram`,
      phone: customer.phone,
      email: customer.email,
      notes: `Telegram: @${customer.telegramUsername || customer.telegramId}`,
    },
  });

  await db.customer.update({
    where: { id: customerId },
    data: { counterpartyId: counterparty.id },
  });

  return counterparty.id;
}

/**
 * Get tenant ID for e-commerce store.
 *
 * Resolution order:
 * 1. STORE_TENANT_ID env var (production)
 * 2. "default-tenant" fallback (development/test only)
 * 3. Error if not configured in production
 */
async function getStoreTenantId(): Promise<string> {
  // 1. Production: explicit config required
  const envTenantId = process.env.STORE_TENANT_ID;
  if (envTenantId) return envTenantId;

  // 2. Development/test: safe fallback
  if (process.env.NODE_ENV !== "production") {
    const defaultTenant = await db.tenant.findUnique({
      where: { id: "default-tenant" },
    });
    if (defaultTenant) return defaultTenant.id;
  }

  // 3. Production without config: explicit error
  throw new Error(
    "STORE_TENANT_ID not configured. " +
    "Set STORE_TENANT_ID environment variable for e-commerce store."
  );
}

/**
 * Create sales_order document from cart.
 * Called during checkout.
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

  if (items.length === 0) {
    throw new Error("Корзина пуста");
  }

  if (deliveryType === "courier" && !deliveryAddressId) {
    throw new Error("Адрес доставки обязателен для курьерской доставки");
  }

  if (deliveryAddressId) {
    const address = await db.customerAddress.findUnique({
      where: { id: deliveryAddressId },
      select: { customerId: true },
    });

    if (!address || address.customerId !== customerId) {
      throw new Error("Invalid delivery address");
    }
  }

  // Get tenant ID for e-commerce store
  const tenantId = await getStoreTenantId();

  const counterpartyId = await getOrCreateCounterparty(customerId);

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = Math.round((itemsTotal + deliveryCost) * 100) / 100;

  const documentNumber = await generateDocumentNumber("sales_order");

  const document = await db.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId,  // E-commerce store tenant
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

  // Record party activity for timeline
  await recordOrderPlaced({
    customerId,
    counterpartyId,
    documentId: document.id,
    orderNumber: document.number,
    totalAmount: document.totalAmount,
    occurredAt: document.createdAt,
  });

  return {
    documentId: document.id,
    documentNumber: document.number,
    totalAmount: document.totalAmount,
  };
}

/**
 * Confirm order payment.
 * Called when payment is received (webhook from payment provider).
 *
 * ADAPTER PATTERN: This function is a facade that delegates to the proper
 * confirm flow (confirmDocumentTransactional). It does NOT directly update
 * document status to bypass the domain service.
 *
 * Known compromise: payment metadata update and document confirm are two
 * separate DB operations (not atomic). This is acceptable for the cleanup
 * phase — the critical bypass (direct status update) is removed.
 *
 * @param params.documentId - The sales_order document ID
 * @param params.paymentExternalId - External payment ID from provider
 * @param params.paymentMethod - Payment method (tochka or cash)
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

  // Idempotency: already paid and confirmed
  if (document.paymentStatus === "paid" && document.status === "confirmed") {
    return;
  }

  // Step 1: Update payment metadata (ecommerce-specific fields)
  // Note: This is a separate operation from confirm, not atomic.
  // Errors here will prevent confirm from running.
  await db.document.update({
    where: { id: documentId },
    data: {
      paymentStatus: "paid",
      paymentMethod,
      paymentExternalId,
      paidAt: new Date(),
    },
  });

  // Step 2: Delegate to proper confirm flow
  // This creates stock movements, writes outbox event, triggers handlers.
  // Uses "system:webhook" as actor for audit trail.
  // If this fails, the payment metadata is already saved — webhook can retry.
  await confirmDocumentTransactional(documentId, "system:webhook");

  // Record party activity for timeline
  await recordPaymentReceived({
    counterpartyId: document.counterpartyId ?? undefined,
    paymentId: paymentExternalId,
    amount: document.totalAmount,
    method: paymentMethod,
    occurredAt: new Date(),
  });
}

/**
 * Confirm ecommerce order payment with proper ERP flow.
 *
 * This function correctly uses confirmDocumentTransactional() to ensure:
 * - Stock movements are created
 * - Outbox event is written
 * - Handlers (balance, journal, payment) are triggered
 *
 * TODO: Unify payment-marking + confirm into one orchestration path
 * with shared transaction boundary for full atomicity.
 *
 * @param documentId - The sales_order document ID
 * @param paymentMethod - Payment method (tochka or cash)
 * @param paymentExternalId - External payment ID (optional)
 * @param actor - User performing the action (for audit)
 * @returns Confirmed document result
 */
export async function confirmEcommerceOrderPayment(params: {
  documentId: string;
  paymentMethod: PaymentMethod;
  paymentExternalId?: string;
  actor: string | null;
}): Promise<ConfirmedDocumentResult> {
  const { documentId, paymentMethod, paymentExternalId, actor } = params;

  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Документ не найден");
  }

  if (document.type !== "sales_order") {
    throw new Error("Документ не является заказом");
  }

  // Idempotency: if already confirmed with payment, return early
  if (document.status === "confirmed" && document.paymentStatus === "paid") {
    // Return the document in the expected format
    return {
      ...document,
      typeName: "Заказ",
      statusName: "Подтверждён",
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as ConfirmedDocumentResult;
  }

  // Step 1: Update payment info (ecommerce-specific)
  await db.document.update({
    where: { id: documentId },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      paymentMethod,
      ...(paymentExternalId && { paymentExternalId }),
    },
  });

  // Step 2: Proper confirm flow (stock, outbox, handlers)
  const result = await confirmDocumentTransactional(documentId, actor);

  // Record party activity for timeline
  if (document.counterpartyId) {
    await recordPaymentReceived({
      counterpartyId: document.counterpartyId,
      paymentId: paymentExternalId || documentId,
      amount: document.totalAmount,
      method: paymentMethod,
      occurredAt: new Date(),
    });
  }

  return result;
}

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
 * Cancel order (if not yet shipped).
 * Customer-initiated cancellation.
 *
 * Uses cancelDocumentTransactional() to ensure:
 * - Reversing stock movements are created
 * - Counterparty balance is recalculated
 * - Payment status is updated to refunded if needed
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
    return; // Already cancelled — idempotent
  }

  // Update payment status to refunded if was paid (ecommerce-specific)
  if (document.paymentStatus === "paid") {
    await db.document.update({
      where: { id: documentId },
      data: { paymentStatus: "refunded" },
    });
  }

  // Proper cancel flow: reversing movements, balance recalc
  await cancelDocumentTransactional(documentId, null); // Customer-initiated, no actor
}

/**
 * Cancel ecommerce order with proper ERP flow.
 *
 * This function correctly uses cancelDocumentTransactional() to ensure:
 * - Reversing stock movements are created
 * - Counterparty balance is recalculated
 * - Payment status is updated to refunded if needed
 *
 * @param documentId - The sales_order document ID
 * @param actor - User performing the action (for audit)
 * @returns Cancelled document result
 */
export async function cancelEcommerceOrder(params: {
  documentId: string;
  actor: string | null;
}): Promise<CancelledDocumentResult> {
  const { documentId, actor } = params;

  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Документ не найден");
  }

  if (document.type !== "sales_order") {
    throw new Error("Документ не является заказом");
  }

  // Idempotency: already cancelled
  if (document.status === "cancelled") {
    return {
      ...document,
      typeName: "Заказ",
      statusName: "Отменён",
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as CancelledDocumentResult;
  }

  // Step 1: Update payment status to refunded if was paid (ecommerce-specific)
  if (document.paymentStatus === "paid") {
    await db.document.update({
      where: { id: documentId },
      data: { paymentStatus: "refunded" },
    });
  }

  // Step 2: Proper cancel flow (reversing movements, balance recalc)
  const result = await cancelDocumentTransactional(documentId, actor);

  return result;
}

/**
 * Update order status (admin: shipped / delivered).
 *
 * Uses state machine to validate the transition before updating.
 * Throws DocumentStateError if transition is not allowed.
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

  // Validate transition through state machine
  validateTransition(document.type, document.status as DocumentStatus, status);

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

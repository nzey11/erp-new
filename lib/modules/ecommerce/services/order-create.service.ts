/**
 * Order Creation Service.
 *
 * Handles creation of sales_order documents from cart checkout.
 */

import { db } from "@/lib/shared/db";
import { generateDocumentNumber } from "@/lib/modules/accounting/documents";
import { recordOrderPlaced } from "@/lib/party";
import { getOrCreateCounterparty } from "./counterparty-bridge.service";
import type { CartItemInput, DeliveryType } from "../types";

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

  const counterpartyId = await getOrCreateCounterparty(customerId, tenantId);

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

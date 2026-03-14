/**
 * Ecommerce domain test factories.
 *
 * Factories for ecommerce entities: customers, products, variants,
 * discounts, cart items, orders, and store pages.
 */

import { db } from "@/lib/shared/db";
import { uniqueId } from "./core";
import { createTenant } from "./auth";
import { createCounterparty } from "./accounting";

// =============================================
// Custom Field Definition Factory
// =============================================

export async function createCustomFieldDefinition(
  overrides: Partial<{
    name: string;
    fieldType: string;
    options: string | null;
    isActive: boolean;
    order: number;
  }> = {}
) {
  const id = uniqueId();
  return db.customFieldDefinition.create({
    data: {
      name: overrides.name ?? `Характеристика ${id}`,
      fieldType: overrides.fieldType ?? "text",
      options: overrides.options ?? null,
      isActive: overrides.isActive ?? true,
      order: overrides.order ?? 0,
    },
  });
}

// =============================================
// Variant Type Factory
// =============================================

export async function createVariantType(
  overrides: Partial<{
    name: string;
    isActive: boolean;
    order: number;
  }> = {}
) {
  const id = uniqueId();
  return db.variantType.create({
    data: {
      name: overrides.name ?? `Тип ${id}`,
      isActive: overrides.isActive ?? true,
      order: overrides.order ?? 0,
    },
  });
}

// =============================================
// Variant Option Factory
// =============================================

export async function createVariantOption(
  variantTypeId: string,
  overrides: Partial<{
    value: string;
    order: number;
  }> = {}
) {
  const id = uniqueId();
  return db.variantOption.create({
    data: {
      variantTypeId,
      value: overrides.value ?? `Опция ${id}`,
      order: overrides.order ?? 0,
    },
  });
}

// =============================================
// Product Variant Factory
// =============================================

export async function createProductVariant(
  productId: string,
  optionId: string,
  overrides: Partial<{
    sku: string;
    barcode: string;
    priceAdjustment: number;
    isActive: boolean;
    tenantId: string;
  }> = {}
) {
  // Get tenantId from overrides or from parent product
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { tenantId: true },
    });
    if (!product?.tenantId) {
      throw new Error(`Cannot create ProductVariant: Product ${productId} not found or has no tenantId`);
    }
    tenantId = product.tenantId;
  }

  return db.productVariant.create({
    data: {
      productId,
      optionId,
      tenantId,
      sku: overrides.sku ?? null,
      barcode: overrides.barcode ?? null,
      priceAdjustment: overrides.priceAdjustment ?? 0,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Product Discount Factory
// =============================================

export async function createProductDiscount(
  productId: string,
  overrides: Partial<{
    name: string;
    type: "percentage" | "fixed";
    value: number;
    validFrom: Date;
    validTo: Date | null;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.productDiscount.create({
    data: {
      productId,
      name: overrides.name ?? `Скидка ${id}`,
      type: overrides.type ?? "percentage",
      value: overrides.value ?? 10,
      validFrom: overrides.validFrom ?? new Date(),
      validTo: overrides.validTo ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Customer Factory
// =============================================

export async function createCustomer(
  overrides: Partial<{
    telegramId: string;
    telegramUsername: string;
    name: string;
    phone: string;
    email: string;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.customer.create({
    data: {
      telegramId: overrides.telegramId ?? `tg_${id}`,
      telegramUsername: overrides.telegramUsername ?? `user_${id}`,
      name: overrides.name ?? `Покупатель ${id}`,
      phone: overrides.phone ?? `+7900${id.slice(-7)}`,
      email: overrides.email,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// StorePage Factory
// =============================================

export async function createStorePage(
  overrides: Partial<{
    title: string;
    slug: string;
    content: string;
    isPublished: boolean;
    showInFooter: boolean;
    showInHeader: boolean;
    sortOrder: number;
    seoTitle: string;
    seoDescription: string;
  }> = {}
) {
  const id = uniqueId();
  return db.storePage.create({
    data: {
      title: overrides.title ?? `Страница ${id}`,
      slug: overrides.slug ?? `page-${id}`,
      content: overrides.content ?? `<p>Контент ${id}</p>`,
      isPublished: overrides.isPublished ?? false,
      showInFooter: overrides.showInFooter ?? false,
      showInHeader: overrides.showInHeader ?? false,
      sortOrder: overrides.sortOrder ?? 0,
      seoTitle: overrides.seoTitle ?? null,
      seoDescription: overrides.seoDescription ?? null,
    },
  });
}

// =============================================
// Cart Item Factory
// =============================================

export async function createCartItem(
  customerId: string,
  productId: string,
  overrides: Partial<{
    variantId: string | null;
    quantity: number;
    priceSnapshot: number;
  }> = {}
) {
  return db.cartItem.create({
    data: {
      customerId,
      productId,
      variantId: overrides.variantId ?? null,
      quantity: overrides.quantity ?? 1,
      priceSnapshot: overrides.priceSnapshot ?? 1000,
    },
  });
}

// =============================================
// Sales Order Document Factory (replaces createOrder)
// =============================================

export async function createOrder(
  customerId: string,
  overrides: Partial<{
    orderNumber: string;
    status: "draft" | "confirmed" | "shipped" | "delivered" | "cancelled";
    deliveryType: "pickup" | "courier";
    totalAmount: number;
    deliveryCost: number;
    notes: string;
    tenantId: string;
  }> = {}
) {
  const id = uniqueId();
  
  // Get or create tenantId
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const tenant = await createTenant();
    tenantId = tenant.id;
  }
  
  // Ensure counterparty exists
  let counterparty = await db.counterparty.findFirst({
    where: { type: "customer" },
  });
  if (!counterparty) {
    counterparty = await createCounterparty({
      type: "customer",
      name: "Test Counterparty",
    });
  }
  return db.document.create({
    data: {
      tenantId,
      number: overrides.orderNumber ?? `ЗК-${id}`,
      type: "sales_order",
      status: overrides.status ?? "draft",
      customerId,
      counterpartyId: counterparty.id,
      deliveryType: overrides.deliveryType ?? "pickup",
      totalAmount: overrides.totalAmount ?? 5000,
      deliveryCost: overrides.deliveryCost ?? 0,
      notes: overrides.notes ?? null,
      paymentStatus: "pending",
    },
  });
}

// =============================================
// Document Item Factory (replaces createOrderItem)
// =============================================

export async function createOrderItem(
  orderId: string,
  productId: string,
  overrides: Partial<{
    variantId: string | null;
    quantity: number;
    price: number;
    total: number;
  }> = {}
) {
  const quantity = overrides.quantity ?? 1;
  const price = overrides.price ?? 1000;
  const total = overrides.total ?? quantity * price;

  return db.documentItem.create({
    data: {
      documentId: orderId,
      productId,
      variantId: overrides.variantId ?? null,
      quantity,
      price,
      total,
    },
  });
}

// =============================================
// Category Factory
// =============================================

export async function createCategory(
  overrides: Partial<{
    name: string;
    parentId: string | null;
    order: number;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.productCategory.create({
    data: {
      name: overrides.name ?? `Категория ${id}`,
      parentId: overrides.parentId ?? null,
      order: overrides.order ?? 0,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Sale Price Factory
// =============================================

export async function createSalePrice(
  productId: string,
  overrides: Partial<{
    price: number;
    priceListId: string | null;
    validFrom: Date;
    validTo: Date | null;
    isActive: boolean;
  }> = {}
) {
  return db.salePrice.create({
    data: {
      productId,
      price: overrides.price ?? 1000,
      priceListId: overrides.priceListId ?? null,
      validFrom: overrides.validFrom ?? new Date(),
      validTo: overrides.validTo ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

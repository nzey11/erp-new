import { db } from "@/lib/shared/db";
import type {
  DocumentType,
  DocumentStatus,
  CounterpartyType,
} from "@/lib/generated/prisma/client";

let counter = 0;

function uniqueId(): string {
  return `test_${Date.now()}_${++counter}`;
}

// =============================================
// Unit Factory
// =============================================

export async function createUnit(
  overrides: Partial<{
    name: string;
    shortName: string;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.unit.create({
    data: {
      name: overrides.name ?? `Единица ${id}`,
      shortName: overrides.shortName ?? id.slice(-6),
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Warehouse Factory
// =============================================

export async function createWarehouse(
  overrides: Partial<{
    name: string;
    address: string;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.warehouse.create({
    data: {
      name: overrides.name ?? `Склад ${id}`,
      address: overrides.address ?? `Адрес ${id}`,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Product Factory
// =============================================

export async function createProduct(
  overrides: Partial<{
    name: string;
    sku: string;
    barcode: string;
    unitId: string;
    categoryId: string;
    isActive: boolean;
    publishedToStore: boolean;
    description: string;
  }> = {}
) {
  const id = uniqueId();

  // Create unit if not provided
  let unitId = overrides.unitId;
  if (!unitId) {
    const unit = await createUnit();
    unitId = unit.id;
  }

  return db.product.create({
    data: {
      name: overrides.name ?? `Товар ${id}`,
      sku: overrides.sku ?? `SKU-${id}`,
      barcode: overrides.barcode,
      unitId,
      categoryId: overrides.categoryId,
      isActive: overrides.isActive ?? true,
      publishedToStore: overrides.publishedToStore ?? false,
      description: overrides.description,
    },
  });
}

// =============================================
// Counterparty Factory
// =============================================

export async function createCounterparty(
  overrides: Partial<{
    name: string;
    type: CounterpartyType;
    inn: string;
    phone: string;
    email: string;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.counterparty.create({
    data: {
      name: overrides.name ?? `Контрагент ${id}`,
      type: overrides.type ?? "customer",
      inn: overrides.inn,
      phone: overrides.phone,
      email: overrides.email,
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Document Factory
// =============================================

export async function createDocument(
  overrides: Partial<{
    number: string;
    type: DocumentType;
    status: DocumentStatus;
    warehouseId: string;
    targetWarehouseId: string;
    counterpartyId: string;
    totalAmount: number;
    date: Date;
    confirmedAt: Date;
    cancelledAt: Date;
  }> = {}
) {
  const id = uniqueId();

  // Create warehouse if not provided
  let warehouseId = overrides.warehouseId;
  if (!warehouseId) {
    const warehouse = await createWarehouse();
    warehouseId = warehouse.id;
  }

  return db.document.create({
    data: {
      number: overrides.number ?? `DOC-${id}`,
      type: overrides.type ?? "stock_receipt",
      status: overrides.status ?? "draft",
      warehouseId,
      targetWarehouseId: overrides.targetWarehouseId,
      counterpartyId: overrides.counterpartyId,
      totalAmount: overrides.totalAmount ?? 0,
      date: overrides.date ?? new Date(),
      confirmedAt: overrides.confirmedAt,
      cancelledAt: overrides.cancelledAt,
    },
  });
}

// =============================================
// Document Item Factory
// =============================================

export async function createDocumentItem(
  documentId: string,
  productId: string,
  overrides: Partial<{
    quantity: number;
    price: number;
    total: number;
    actualQty: number;
    expectedQty: number;
  }> = {}
) {
  const quantity = overrides.quantity ?? 1;
  const price = overrides.price ?? 100;
  const total = overrides.total ?? quantity * price;

  return db.documentItem.create({
    data: {
      documentId,
      productId,
      quantity,
      price,
      total,
      actualQty: overrides.actualQty,
      expectedQty: overrides.expectedQty,
    },
  });
}

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
  }> = {}
) {
  return db.productVariant.create({
    data: {
      productId,
      optionId,
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
// Stock Record Factory
// =============================================

export async function createStockRecord(
  warehouseId: string,
  productId: string,
  quantity: number
) {
  return db.stockRecord.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    update: { quantity },
    create: { warehouseId, productId, quantity },
  });
}

// =============================================
// User Factory
// =============================================

export async function createUser(
  overrides: Partial<{
    username: string;
    password: string;
    email: string;
    role: "admin" | "manager" | "accountant" | "viewer";
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.user.create({
    data: {
      username: overrides.username ?? `user_${id}`,
      password: overrides.password ?? "$2a$10$test_hash",
      email: overrides.email,
      role: overrides.role ?? "admin",
      isActive: overrides.isActive ?? true,
    },
  });
}

// =============================================
// Helper: Create document with items
// =============================================

export async function createDocumentWithItems(
  docOverrides: Parameters<typeof createDocument>[0],
  items: Array<{
    productId?: string;
    quantity: number;
    price?: number;
    actualQty?: number;
  }>
) {
  // Create products if not provided
  const productIds: string[] = [];
  for (const item of items) {
    if (item.productId) {
      productIds.push(item.productId);
    } else {
      const product = await createProduct();
      productIds.push(product.id);
    }
  }

  // Calculate total amount
  let totalAmount = docOverrides?.totalAmount ?? 0;
  if (totalAmount === 0) {
    totalAmount = items.reduce((sum, item, _i) => {
      const price = item.price ?? 100;
      return sum + item.quantity * price;
    }, 0);
  }

  // Create document
  const document = await createDocument({
    ...docOverrides,
    totalAmount,
  });

  // Create document items
  const documentItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = await createDocumentItem(document.id, productIds[i], {
      quantity: items[i].quantity,
      price: items[i].price ?? 100,
      actualQty: items[i].actualQty,
    });
    documentItems.push(item);
  }

  return { document, items: documentItems, productIds };
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
// Order Factory
// =============================================

export async function createOrder(
  customerId: string,
  overrides: Partial<{
    orderNumber: string;
    status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
    deliveryType: "pickup" | "courier";
    totalAmount: number;
    deliveryCost: number;
    notes: string;
  }> = {}
) {
  const id = uniqueId();
  return db.order.create({
    data: {
      orderNumber: overrides.orderNumber ?? `ORD-${id}`,
      customerId,
      status: overrides.status ?? "pending",
      deliveryType: overrides.deliveryType ?? "pickup",
      totalAmount: overrides.totalAmount ?? 5000,
      deliveryCost: overrides.deliveryCost ?? 0,
      notes: overrides.notes ?? null,
    },
  });
}

// =============================================
// Order Item Factory
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

  return db.orderItem.create({
    data: {
      orderId,
      productId,
      variantId: overrides.variantId ?? null,
      quantity,
      price,
      total,
    },
  });
}

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
// Price List Factory
// =============================================

export async function createPriceList(
  overrides: Partial<{
    name: string;
    description: string | null;
    isActive: boolean;
  }> = {}
) {
  const id = uniqueId();
  return db.priceList.create({
    data: {
      name: overrides.name ?? `Прайс-лист ${id}`,
      description: overrides.description ?? null,
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

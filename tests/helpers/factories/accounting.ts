/**
 * Accounting domain test factories.
 *
 * Factories for accounting entities: warehouses, products, documents,
 * counterparties, stock records, and accounting seeds.
 */

import { db } from "@/lib/shared/db";
import type {
  DocumentType,
  DocumentStatus,
  CounterpartyType,
} from "@/lib/generated/prisma/client";
import { AccountType, AccountCategory, TaxRegime } from "@/lib/generated/prisma/enums";
import { uniqueId } from "./core";
import { createTenant } from "./auth";

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
    tenantId: string;
  }> = {}
) {
  const id = uniqueId();

  // Use provided tenantId or create default tenant
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const tenant = await createTenant({ id: "default-tenant" });
    tenantId = tenant.id;
  }

  return db.warehouse.create({
    data: {
      tenantId,
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
    tenantId: string;
  }> = {}
) {
  const id = uniqueId();

  // Create unit if not provided
  let unitId = overrides.unitId;
  if (!unitId) {
    const unit = await createUnit();
    unitId = unit.id;
  }

  // Get or create tenant if not provided
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const tenant = await createTenant();
    tenantId = tenant.id;
  }

  return db.product.create({
    data: {
      tenantId,
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
    tenantId: string;
  }> = {}
) {
  const id = uniqueId();

  // Use provided tenantId or create default tenant
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const tenant = await createTenant();
    tenantId = tenant.id;
  }

  return db.counterparty.create({
    data: {
      tenantId: tenantId!,
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
    tenantId: string;
  }> = {}
) {
  const id = uniqueId();

  // Create warehouse if not provided
  let warehouseId = overrides.warehouseId;
  let tenantId = overrides.tenantId;
  if (!warehouseId) {
    const warehouse = await createWarehouse({ tenantId });
    warehouseId = warehouse.id;
    tenantId = warehouse.tenantId;  // Use warehouse's tenantId
  }

  // If still no tenantId, get from warehouse or create default
  if (!tenantId && warehouseId) {
    const warehouse = await db.warehouse.findUnique({
      where: { id: warehouseId },
      select: { tenantId: true },
    });
    tenantId = warehouse?.tenantId ?? undefined;
  }

  if (!tenantId) {
    const tenant = await createTenant();
    tenantId = tenant.id;
  }

  return db.document.create({
    data: {
      tenantId,
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
    totalAmount = items.reduce((sum, item) => {
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
// Accounting: Chart of Accounts + CompanySettings seed
// =============================================

const MINIMAL_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
}> = [
  { code: "41.1", name: "Товары на складах",           type: AccountType.active,         category: AccountCategory.asset     },
  { code: "60",   name: "Расчеты с поставщиками",       type: AccountType.active_passive,  category: AccountCategory.liability },
  { code: "62",   name: "Расчеты с покупателями",       type: AccountType.active_passive,  category: AccountCategory.asset     },
  { code: "90.1", name: "Выручка",                      type: AccountType.passive,         category: AccountCategory.income    },
  { code: "90.2", name: "Себестоимость продаж",          type: AccountType.active,          category: AccountCategory.expense   },
  { code: "50",   name: "Касса",                        type: AccountType.active,          category: AccountCategory.asset     },
  { code: "51",   name: "Расчетные счета",               type: AccountType.active,          category: AccountCategory.asset     },
  { code: "91.1", name: "Прочие доходы",                type: AccountType.passive,         category: AccountCategory.income    },
  { code: "91.2", name: "Прочие расходы",               type: AccountType.active,          category: AccountCategory.expense   },
  // Required by posting-rules.ts for ОСНО and write_off scenarios
  { code: "19",    name: "НДС по приобретённым ценностям", type: AccountType.active,        category: AccountCategory.asset     },
  { code: "90.3",  name: "НДС",                           type: AccountType.active,         category: AccountCategory.expense   },
  { code: "68.02", name: "Расчеты по НДС",               type: AccountType.active_passive,  category: AccountCategory.liability },
  { code: "94",    name: "Недостачи и потери",            type: AccountType.active,          category: AccountCategory.expense   },
];

/**
 * Seed minimum chart of accounts required for journal/accounting tests.
 * Safe to call multiple times (upsert). Also creates JournalCounter.
 * Returns a map: account code → DB id.
 */
export async function seedTestAccounts(): Promise<Record<string, string>> {
  // Ensure JournalCounter exists
  await db.journalCounter.upsert({
    where:  { prefix: "JE" },
    create: { prefix: "JE", lastNumber: 0 },
    update: {},
  });

  const ids: Record<string, string> = {};
  for (const acc of MINIMAL_ACCOUNTS) {
    const row = await db.account.upsert({
      where:  { code: acc.code },
      create: {
        code:     acc.code,
        name:     acc.name,
        type:     acc.type,
        category: acc.category,
        isSystem: true,
        isActive: true,
        order:    0,
      },
      update: {},
    });
    ids[acc.code] = row.id;
  }
  return ids;
}

/**
 * Seed CompanySettings for accounting/journal tests.
 * Requires account IDs from seedTestAccounts().
 * Safe to call multiple times — returns existing record if already created.
 */
export async function seedCompanySettings(
  accountIds: Record<string, string>
) {
  const existing = await db.companySettings.findFirst();
  if (existing) return existing;

  return db.companySettings.create({
    data: {
      name:                 "Test Company",
      taxRegime:            TaxRegime.usn_income,
      vatRate:              20,
      usnRate:              6,
      initialCapital:       0,
      fiscalYearStartMonth: 1,
      cashAccountId:        accountIds["50"],
      bankAccountId:        accountIds["51"],
      inventoryAccountId:   accountIds["41.1"],
      supplierAccountId:    accountIds["60"],
      customerAccountId:    accountIds["62"],
      salesAccountId:       accountIds["90.1"],
      cogsAccountId:        accountIds["90.2"],
    },
  });
}

// =============================================
// Accounting: Extended seed for financial reports
// =============================================

/**
 * Accounts required by РСБУ Form 1 / Form 2 / Form 4 that are absent
 * from MINIMAL_ACCOUNTS.  Added here so tests can opt-in without
 * polluting the minimal journal/posting-rules seed.
 */
const REPORT_ONLY_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
}> = [
  // Form 2: Profit & Loss
  { code: "44",    name: "Расходы на продажу",                type: AccountType.active,         category: AccountCategory.expense   },
  { code: "68.04", name: "Налог на прибыль",                 type: AccountType.active_passive,  category: AccountCategory.liability },
  // Form 4: Cash Flow
  { code: "52",    name: "Валютный счет",                    type: AccountType.active,          category: AccountCategory.asset     },
  // Form 1: Balance Sheet — non-current assets
  { code: "01",    name: "Основные средства",                type: AccountType.active,          category: AccountCategory.asset     },
  { code: "02",    name: "Амортизация ОС",                   type: AccountType.passive,         category: AccountCategory.asset     },
  { code: "04",    name: "НМА",                              type: AccountType.active,          category: AccountCategory.asset     },
  { code: "05",    name: "Амортизация НМА",                  type: AccountType.passive,         category: AccountCategory.asset     },
  // Form 1: Balance Sheet — current assets
  { code: "41",    name: "Товары",                           type: AccountType.active,          category: AccountCategory.asset     },
  { code: "57",    name: "Переводы в пути",                  type: AccountType.active,          category: AccountCategory.asset     },
  // Form 1: Balance Sheet — equity
  { code: "80",    name: "Уставный капитал",                 type: AccountType.passive,         category: AccountCategory.equity    },
  { code: "82",    name: "Резервный капитал",                type: AccountType.passive,         category: AccountCategory.equity    },
  { code: "83",    name: "Добавочный капитал",               type: AccountType.passive,         category: AccountCategory.equity    },
  { code: "84",    name: "Нераспределённая прибыль",         type: AccountType.active_passive,  category: AccountCategory.equity    },
  { code: "99",    name: "Прибыли и убытки",                 type: AccountType.active_passive,  category: AccountCategory.equity    },
  // Form 1: Balance Sheet — liabilities
  { code: "66",    name: "Краткосрочные займы",              type: AccountType.passive,         category: AccountCategory.liability },
  { code: "67",    name: "Долгосрочные займы",               type: AccountType.passive,         category: AccountCategory.liability },
  { code: "68",    name: "Расчеты по налогам",               type: AccountType.active_passive,  category: AccountCategory.liability },
];

/**
 * Seed full chart of accounts for financial report tests (Form 1/2/4).
 * Superset of seedTestAccounts() — safe to call instead of it.
 * Returns merged map: account code → DB id.
 */
export async function seedReportAccounts(): Promise<Record<string, string>> {
  const ids = await seedTestAccounts();

  for (const acc of REPORT_ONLY_ACCOUNTS) {
    const row = await db.account.upsert({
      where:  { code: acc.code },
      create: {
        code:     acc.code,
        name:     acc.name,
        type:     acc.type,
        category: acc.category,
        isSystem: true,
        isActive: true,
        order:    0,
      },
      update: {},
    });
    ids[acc.code] = row.id;
  }
  return ids;
}

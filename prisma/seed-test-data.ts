/**
 * seed-test-data.ts
 *
 * Comprehensive test-data seed covering all module interconnections.
 * IDEMPOTENT — safe to run multiple times (upsert / findFirst+create patterns).
 *
 * Sections:
 *   1. Tenant & Users
 *   2. Catalog (categories + products + variants + prices + discounts)
 *   3. Warehouses
 *   4. Counterparties + Party links
 *   5. Documents (confirmed + draft)
 *   6. Finance Payments
 *   7. E-commerce (customers, orders, cart items, reviews)
 *   8. CRM Activities
 *   9. Outbox processing
 *  10. ProductCatalogProjection rebuild
 *  11. Verification
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";
import { AccountType, AccountCategory } from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

// ── Prisma client setup (mirrors seed.ts pattern) ────────────────────────────
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── toNumber helper (mirrors lib/shared/db.ts) ────────────────────────────────
function toNumber(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === "number" ? val : Number(val);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TENANT_ID = "test-company-tenant";
const TENANT_SLUG = "test-company";
const WH_MAIN_ID = "test-wh-main";
const WH_SECOND_ID = "test-wh-second";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Tenant & Users
// ─────────────────────────────────────────────────────────────────────────────
async function seedTenantAndUsers() {
  console.log("\n[1] Tenant & Users...");

  // Tenant
  await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: "ООО ТестКомпания" },
    create: { id: TENANT_ID, name: "ООО ТестКомпания", slug: TENANT_SLUG },
  });

  // Tenant settings
  const existing = await prisma.tenantSettings.findUnique({ where: { tenantId: TENANT_ID } });
  if (!existing) {
    await prisma.tenantSettings.create({
      data: {
        tenantId: TENANT_ID,
        name: "ООО ТестКомпания",
        taxRegime: "usn_income",
        vatRate: new Prisma.Decimal(20),
        usnRate: new Prisma.Decimal(6),
      },
    });
  }

  // Users
  const pw = await hash("test123", 12);
  const users = [
    { id: "test-user-admin",     username: "test_admin",     role: "admin"   as const },
    { id: "test-user-manager",   username: "test_manager",   role: "manager" as const },
    { id: "test-user-warehouse", username: "test_warehouse", role: "viewer"  as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { password: pw },
      create: { id: u.id, username: u.username, password: pw, role: u.role },
    });
    await prisma.tenantMembership.upsert({
      where: { userId_tenantId: { userId: u.id, tenantId: TENANT_ID } },
      update: {},
      create: { userId: u.id, tenantId: TENANT_ID, role: u.role, isActive: true },
    });
  }

  console.log("  ✓ Tenant «ООО ТестКомпания» + 3 users (admin/manager/viewer)");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1b: Chart of Accounts (global) + TenantSettings account mappings
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal Russian chart of accounts needed for journal posting */
const ACCOUNTS_SEED = [
  // Assets
  { code: "01", name: "Основные средства",                              type: AccountType.active,          category: AccountCategory.asset,     order: 100 },
  { code: "02", name: "Амортизация основных средств",                    type: AccountType.passive,         category: AccountCategory.asset,     order: 110 },
  { code: "04", name: "Нематериальные активы",                          type: AccountType.active,          category: AccountCategory.asset,     order: 120 },
  { code: "05", name: "Амортизация нематериальных активов",              type: AccountType.passive,         category: AccountCategory.asset,     order: 130 },
  { code: "10", name: "Материалы",                                       type: AccountType.active,          category: AccountCategory.asset,     order: 200 },
  { code: "19", name: "НДС по приобретенным ценностям",                  type: AccountType.active,          category: AccountCategory.asset,     order: 290,  analyticsType: "counterparty" },
  // Goods / Inventory
  { code: "41",   name: "Товары",                                        type: AccountType.active,          category: AccountCategory.asset,     order: 400 },
  { code: "41.1", name: "Товары на складах",                             type: AccountType.active,          category: AccountCategory.asset,     order: 401,  analyticsType: "warehouse" },
  { code: "41.2", name: "Товары в розничной торговле",                   type: AccountType.active,          category: AccountCategory.asset,     order: 402,  analyticsType: "warehouse" },
  { code: "41.3", name: "Тара под товаром и порожняя",                   type: AccountType.active,          category: AccountCategory.asset,     order: 403 },
  { code: "42",   name: "Торговая наценка",                              type: AccountType.passive,         category: AccountCategory.asset,     order: 410 },
  { code: "44",   name: "Расходы на продажу",                            type: AccountType.active,          category: AccountCategory.expense,   order: 420 },
  { code: "45",   name: "Товары отгруженные",                            type: AccountType.active,          category: AccountCategory.asset,     order: 430 },
  // Cash & Bank
  { code: "50",   name: "Касса",                                         type: AccountType.active,          category: AccountCategory.asset,     order: 500 },
  { code: "50.1", name: "Касса организации",                             type: AccountType.active,          category: AccountCategory.asset,     order: 501 },
  { code: "51",   name: "Расчетные счета",                               type: AccountType.active,          category: AccountCategory.asset,     order: 510 },
  { code: "52",   name: "Валютные счета",                                type: AccountType.active,          category: AccountCategory.asset,     order: 520 },
  { code: "57",   name: "Переводы в пути",                               type: AccountType.active,          category: AccountCategory.asset,     order: 570 },
  // Settlements
  { code: "60",    name: "Расчеты с поставщиками и подрядчиками",        type: AccountType.active_passive,  category: AccountCategory.liability, order: 600,  analyticsType: "counterparty" },
  { code: "62",    name: "Расчеты с покупателями и заказчиками",         type: AccountType.active_passive,  category: AccountCategory.asset,     order: 620,  analyticsType: "counterparty" },
  { code: "66",    name: "Расчеты по краткосрочным кредитам и займам",   type: AccountType.active_passive,  category: AccountCategory.liability, order: 660 },
  { code: "67",    name: "Расчеты по долгосрочным кредитам и займам",    type: AccountType.active_passive,  category: AccountCategory.liability, order: 670 },
  { code: "68",    name: "Расчеты по налогам и сборам",                  type: AccountType.active_passive,  category: AccountCategory.liability, order: 680 },
  { code: "68.01", name: "НДФЛ",                                         type: AccountType.active_passive,  category: AccountCategory.liability, order: 681 },
  { code: "68.02", name: "НДС",                                          type: AccountType.active_passive,  category: AccountCategory.liability, order: 682 },
  { code: "68.04", name: "Налог на прибыль",                             type: AccountType.active_passive,  category: AccountCategory.liability, order: 684 },
  { code: "69",    name: "Расчеты по социальному страхованию",           type: AccountType.active_passive,  category: AccountCategory.liability, order: 690 },
  { code: "70",    name: "Расчеты с персоналом по оплате труда",         type: AccountType.active_passive,  category: AccountCategory.liability, order: 700 },
  { code: "71",    name: "Расчеты с подотчетными лицами",                type: AccountType.active_passive,  category: AccountCategory.liability, order: 710 },
  { code: "73",    name: "Расчеты с персоналом по прочим операциям",     type: AccountType.active_passive,  category: AccountCategory.liability, order: 730 },
  { code: "76",    name: "Расчеты с разными дебиторами и кредиторами",   type: AccountType.active_passive,  category: AccountCategory.liability, order: 760 },
  // Capital
  { code: "80",   name: "Уставный капитал",                             type: AccountType.passive,         category: AccountCategory.equity,    order: 800 },
  { code: "82",   name: "Резервный капитал",                             type: AccountType.passive,         category: AccountCategory.equity,    order: 820 },
  { code: "83",   name: "Добавочный капитал",                            type: AccountType.passive,         category: AccountCategory.equity,    order: 830 },
  { code: "84",   name: "Нераспределенная прибыль (непокрытый убыток)",  type: AccountType.active_passive,  category: AccountCategory.equity,    order: 840 },
  { code: "84.1", name: "Нераспределенная прибыль отчетного года",       type: AccountType.passive,         category: AccountCategory.equity,    order: 841 },
  { code: "84.2", name: "Непокрытый убыток отчетного года",              type: AccountType.active,          category: AccountCategory.equity,    order: 842 },
  // Financial results
  { code: "90",   name: "Продажи",                                       type: AccountType.active_passive,  category: AccountCategory.income,    order: 900 },
  { code: "90.1", name: "Выручка",                                       type: AccountType.passive,         category: AccountCategory.income,    order: 901 },
  { code: "90.2", name: "Себестоимость продаж",                          type: AccountType.active,          category: AccountCategory.expense,   order: 902 },
  { code: "90.3", name: "НДС",                                           type: AccountType.active,          category: AccountCategory.expense,   order: 903 },
  { code: "90.9", name: "Прибыль/убыток от продаж",                      type: AccountType.active_passive,  category: AccountCategory.income,    order: 909 },
  { code: "91",   name: "Прочие доходы и расходы",                       type: AccountType.active_passive,  category: AccountCategory.income,    order: 910 },
  { code: "91.1", name: "Прочие доходы",                                 type: AccountType.passive,         category: AccountCategory.income,    order: 911 },
  { code: "91.2", name: "Прочие расходы",                                type: AccountType.active,          category: AccountCategory.expense,   order: 912 },
  { code: "91.9", name: "Сальдо прочих доходов и расходов",              type: AccountType.active_passive,  category: AccountCategory.income,    order: 919 },
  { code: "94",   name: "Недостачи и потери от порчи ценностей",         type: AccountType.active,          category: AccountCategory.expense,   order: 940 },
  { code: "96",   name: "Резервы предстоящих расходов",                  type: AccountType.passive,         category: AccountCategory.liability, order: 960 },
  { code: "97",   name: "Расходы будущих периодов",                      type: AccountType.active,          category: AccountCategory.asset,     order: 970 },
  { code: "99",   name: "Прибыли и убытки",                              type: AccountType.active_passive,  category: AccountCategory.equity,    order: 990 },
] as const;

async function seedChartOfAccounts() {
  console.log("\n📊 Section 1b: Chart of Accounts...");

  // Ensure JournalCounter exists
  await prisma.journalCounter.upsert({
    where: { prefix: "JE" },
    create: { prefix: "JE", lastNumber: 0 },
    update: {},
  });

  // Upsert all accounts globally (Account has no tenantId — shared chart)
  // Process in two passes: parents first, then sub-accounts (those with '.')
  const parents = ACCOUNTS_SEED.filter((a) => !a.code.includes("."));
  const children = ACCOUNTS_SEED.filter((a) => a.code.includes("."));

  for (const account of [...parents, ...children]) {
    let parentId: string | undefined = undefined;
    if (account.code.includes(".")) {
      const parentCode = account.code.split(".")[0];
      const parent = await prisma.account.findUnique({ where: { code: parentCode } });
      if (parent) parentId = parent.id;
    }

    await prisma.account.upsert({
      where: { code: account.code },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        parentId: parentId ?? null,
        analyticsType: "analyticsType" in account ? (account as any).analyticsType : undefined,
        order: account.order,
        isSystem: true,
        isActive: true,
      },
      update: {
        name: account.name,
        type: account.type,
        category: account.category,
        parentId: parentId ?? null,
        analyticsType: "analyticsType" in account ? (account as any).analyticsType : undefined,
        order: account.order,
      },
    });
  }

  console.log(`  ✓ ${ACCOUNTS_SEED.length} accounts upserted (global chart of accounts)`);

  // ── Update TenantSettings with account ID mappings ────────────────────────
  // Fetch the account IDs we need for the mapping
  const [cashAcc, bankAcc, inventoryAcc, supplierAcc, customerAcc,
         vatAcc, vatPayableAcc, salesAcc, cogsAcc, profitAcc, retainedAcc] = await Promise.all([
    prisma.account.findUnique({ where: { code: "50"   } }),
    prisma.account.findUnique({ where: { code: "51"   } }),
    prisma.account.findUnique({ where: { code: "41.1" } }),
    prisma.account.findUnique({ where: { code: "60"   } }),
    prisma.account.findUnique({ where: { code: "62"   } }),
    prisma.account.findUnique({ where: { code: "19"   } }),
    prisma.account.findUnique({ where: { code: "68.02"} }),
    prisma.account.findUnique({ where: { code: "90.1" } }),
    prisma.account.findUnique({ where: { code: "90.2" } }),
    prisma.account.findUnique({ where: { code: "99"   } }),
    prisma.account.findUnique({ where: { code: "84"   } }),
  ]);

  // Update (not create) — TenantSettings already exists from Section 1
  await prisma.tenantSettings.update({
    where: { tenantId: TENANT_ID },
    data: {
      cashAccountId:             cashAcc?.id             ?? null,
      bankAccountId:             bankAcc?.id             ?? null,
      inventoryAccountId:        inventoryAcc?.id        ?? null,
      supplierAccountId:         supplierAcc?.id         ?? null,
      customerAccountId:         customerAcc?.id         ?? null,
      vatAccountId:              vatAcc?.id              ?? null,
      vatPayableAccountId:       vatPayableAcc?.id       ?? null,
      salesAccountId:            salesAcc?.id            ?? null,
      cogsAccountId:             cogsAcc?.id             ?? null,
      profitAccountId:           profitAcc?.id           ?? null,
      retainedEarningsAccountId: retainedAcc?.id         ?? null,
    },
  });

  console.log(`  ✓ TenantSettings for «ООО ТестКомпания» updated with account ID mappings`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Catalog
// ─────────────────────────────────────────────────────────────────────────────
async function seedCatalog() {
  console.log("\n[2] Catalog...");

  // Unit
  const unitSht = await prisma.unit.findUniqueOrThrow({ where: { shortName: "шт" } });

  // Categories
  const catElectronics = await prisma.productCategory.upsert({
    where: { id: "test-cat-electronics" },
    update: { name: "Электроника" },
    create: { id: "test-cat-electronics", name: "Электроника", order: 10, isActive: true },
  });
  const catClothes = await prisma.productCategory.upsert({
    where: { id: "test-cat-clothes" },
    update: { name: "Одежда" },
    create: { id: "test-cat-clothes", name: "Одежда", order: 20, isActive: true },
  });
  const catFood = await prisma.productCategory.upsert({
    where: { id: "test-cat-food" },
    update: { name: "Продукты" },
    create: { id: "test-cat-food", name: "Продукты", order: 30, isActive: true },
  });

  console.log("  ✓ 3 categories");

  // Products definition
  type ProductDef = {
    id: string;
    name: string;
    sku: string;
    categoryId: string;
    purchasePrice: number;
    salePrice: number;
    isActive: boolean;
    publishedToStore: boolean;
    discountPct?: number;
  };

  const productDefs: ProductDef[] = [
    // Electronics
    { id: "test-prod-iphone",   name: "iPhone 15 Pro",    sku: "IPHONE-15-PRO", categoryId: catElectronics.id, purchasePrice: 65000, salePrice: 89990, isActive: true,  publishedToStore: true },
    { id: "test-prod-tv",       name: 'Samsung TV 55"',   sku: "SAMSUNG-TV-55",  categoryId: catElectronics.id, purchasePrice: 35000, salePrice: 49990, isActive: true,  publishedToStore: true },
    { id: "test-prod-laptop",   name: "Ноутбук Dell",     sku: "DELL-LAPTOP",    categoryId: catElectronics.id, purchasePrice: 55000, salePrice: 74990, isActive: false, publishedToStore: false },
    // Clothes
    { id: "test-prod-tshirt",   name: "Футболка базовая", sku: "TSHIRT-BASIC",   categoryId: catClothes.id,     purchasePrice: 300,   salePrice: 590,   isActive: true,  publishedToStore: true },
    { id: "test-prod-jeans",    name: "Джинсы slim",      sku: "JEANS-SLIM",     categoryId: catClothes.id,     purchasePrice: 1200,  salePrice: 2290,  isActive: true,  publishedToStore: true },
    { id: "test-prod-jacket",   name: "Куртка зимняя",    sku: "JACKET-WINTER",  categoryId: catClothes.id,     purchasePrice: 3500,  salePrice: 6990,  isActive: true,  publishedToStore: true,  discountPct: 20 },
    { id: "test-prod-dress",    name: "Платье летнее",    sku: "DRESS-SUMMER",   categoryId: catClothes.id,     purchasePrice: 800,   salePrice: 1490,  isActive: false, publishedToStore: false },
    // Food
    { id: "test-prod-bread",    name: "Хлеб белый",       sku: "BREAD-WHITE",    categoryId: catFood.id,        purchasePrice: 30,    salePrice: 55,    isActive: true,  publishedToStore: true,  discountPct: 10 },
    { id: "test-prod-milk",     name: "Молоко 3.2%",      sku: "MILK-32",        categoryId: catFood.id,        purchasePrice: 60,    salePrice: 89,    isActive: true,  publishedToStore: true },
    { id: "test-prod-cheese",   name: "Сыр Российский",   sku: "CHEESE-RUS",     categoryId: catFood.id,        purchasePrice: 350,   salePrice: 490,   isActive: true,  publishedToStore: true },
  ];

  for (const p of productDefs) {
    // Upsert product — use tenantId+sku unique constraint
    let product = await prisma.product.findFirst({
      where: { tenantId: TENANT_ID, sku: p.sku },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          id: p.id,
          tenantId: TENANT_ID,
          name: p.name,
          sku: p.sku,
          unitId: unitSht.id,
          categoryId: p.categoryId,
          isActive: p.isActive,
          publishedToStore: p.publishedToStore,
        },
      });
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { name: p.name, isActive: p.isActive, publishedToStore: p.publishedToStore },
      });
    }

    // Purchase price
    await prisma.purchasePrice.upsert({
      where: { id: `test-pp-${product.id}` },
      update: { price: new Prisma.Decimal(p.purchasePrice) },
      create: {
        id: `test-pp-${product.id}`,
        productId: product.id,
        price: new Prisma.Decimal(p.purchasePrice),
        currency: "RUB",
        isActive: true,
      },
    });

    // Sale price (default price list)
    await prisma.salePrice.upsert({
      where: { id: `test-sp-${product.id}` },
      update: { price: new Prisma.Decimal(p.salePrice) },
      create: {
        id: `test-sp-${product.id}`,
        productId: product.id,
        priceListId: null,
        price: new Prisma.Decimal(p.salePrice),
        currency: "RUB",
        isActive: true,
      },
    });

    // Discount if specified
    if (p.discountPct) {
      const discountId = `test-disc-${product.id}`;
      const existing = await prisma.productDiscount.findUnique({ where: { id: discountId } });
      if (!existing) {
        await prisma.productDiscount.create({
          data: {
            id: discountId,
            productId: product.id,
            name: `Скидка ${p.discountPct}%`,
            type: "percentage",
            value: new Prisma.Decimal(p.discountPct),
            isActive: true,
          },
        });
      }
    }
  }
  console.log(`  ✓ ${productDefs.length} products with prices`);

  // ── Variant types ─────────────────────────────────────────────────────────

  // VariantType: Цвет
  let vtColor = await prisma.variantType.findFirst({ where: { name: "Цвет" } });
  if (!vtColor) {
    vtColor = await prisma.variantType.create({ data: { name: "Цвет", isActive: true, order: 1 } });
  }
  // VariantType: Размер
  let vtSize = await prisma.variantType.findFirst({ where: { name: "Размер" } });
  if (!vtSize) {
    vtSize = await prisma.variantType.create({ data: { name: "Размер", isActive: true, order: 2 } });
  }
  // VariantType: Память
  let vtMemory = await prisma.variantType.findFirst({ where: { name: "Память" } });
  if (!vtMemory) {
    vtMemory = await prisma.variantType.create({ data: { name: "Память", isActive: true, order: 3 } });
  }

  // Variant options
  async function upsertOption(variantTypeId: string, value: string, order: number) {
    let opt = await prisma.variantOption.findFirst({ where: { variantTypeId, value } });
    if (!opt) {
      opt = await prisma.variantOption.create({ data: { variantTypeId, value, order } });
    }
    return opt;
  }

  const optBlack  = await upsertOption(vtColor.id,  "Чёрный",  1);
  const optWhite  = await upsertOption(vtColor.id,  "Белый",   2);
  const opt128    = await upsertOption(vtMemory.id, "128GB",   1);
  const opt256    = await upsertOption(vtMemory.id, "256GB",   2);
  const optS      = await upsertOption(vtSize.id,   "S",       1);
  const optM      = await upsertOption(vtSize.id,   "M",       2);
  const optL      = await upsertOption(vtSize.id,   "L",       3);
  const optXL     = await upsertOption(vtSize.id,   "XL",      4);

  // iPhone variants: color + memory
  const iPhoneId = (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "IPHONE-15-PRO" } }))!.id;
  const variantDefs = [
    { productId: iPhoneId, optionId: optBlack.id, sku: "IPHONE-15-PRO-BLK" },
    { productId: iPhoneId, optionId: optWhite.id, sku: "IPHONE-15-PRO-WHT" },
    { productId: iPhoneId, optionId: opt128.id,   sku: "IPHONE-15-PRO-128" },
    { productId: iPhoneId, optionId: opt256.id,   sku: "IPHONE-15-PRO-256" },
  ];

  // TShirt variants: size + color
  const tShirtId = (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "TSHIRT-BASIC" } }))!.id;
  const tShirtVariants = [
    { productId: tShirtId, optionId: optS.id,    sku: "TSHIRT-S"   },
    { productId: tShirtId, optionId: optM.id,    sku: "TSHIRT-M"   },
    { productId: tShirtId, optionId: optL.id,    sku: "TSHIRT-L"   },
    { productId: tShirtId, optionId: optXL.id,   sku: "TSHIRT-XL"  },
    { productId: tShirtId, optionId: optBlack.id, sku: "TSHIRT-BLK" },
    { productId: tShirtId, optionId: optWhite.id, sku: "TSHIRT-WHT" },
  ];

  for (const v of [...variantDefs, ...tShirtVariants]) {
    const existing = await prisma.productVariant.findFirst({
      where: { productId: v.productId, optionId: v.optionId },
    });
    if (!existing) {
      await prisma.productVariant.create({
        data: {
          productId: v.productId,
          optionId: v.optionId,
          sku: v.sku,
          tenantId: TENANT_ID,
          isActive: true,
        },
      });
    }
  }
  console.log(`  ✓ ${variantDefs.length + tShirtVariants.length} product variants`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Warehouses
// ─────────────────────────────────────────────────────────────────────────────
async function seedWarehouses() {
  console.log("\n[3] Warehouses...");

  await prisma.warehouse.upsert({
    where: { id: WH_MAIN_ID },
    update: { name: "Основной склад" },
    create: {
      id: WH_MAIN_ID,
      tenantId: TENANT_ID,
      name: "Основной склад",
      address: "г. Москва, ул. Складская, 1",
      responsibleName: "Иванов И.И.",
      isActive: true,
    },
  });

  await prisma.warehouse.upsert({
    where: { id: WH_SECOND_ID },
    update: { name: "Склад №2" },
    create: {
      id: WH_SECOND_ID,
      tenantId: TENANT_ID,
      name: "Склад №2",
      address: "г. Москва, ул. Складская, 2",
      responsibleName: "Петров П.П.",
      isActive: true,
    },
  });

  console.log("  ✓ 2 warehouses");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Counterparties + Party links
// ─────────────────────────────────────────────────────────────────────────────

/** Idempotent Party + PartyLink creation for a counterparty */
async function ensurePartyForCounterparty(counterpartyId: string, name: string, type: "person" | "organization") {
  // Check if PartyLink already exists
  const existingLink = await prisma.partyLink.findUnique({
    where: { entityType_entityId: { entityType: "counterparty", entityId: counterpartyId } },
  });
  if (existingLink) return existingLink.partyId;

  // Check if Party with primaryCounterpartyId exists
  const existingParty = await prisma.party.findUnique({
    where: { primaryCounterpartyId: counterpartyId },
  });
  if (existingParty) {
    // Ensure link exists
    await prisma.partyLink.upsert({
      where: { entityType_entityId: { entityType: "counterparty", entityId: counterpartyId } },
      update: {},
      create: { partyId: existingParty.id, entityType: "counterparty", entityId: counterpartyId, isPrimary: true },
    });
    return existingParty.id;
  }

  // Create new Party + link in transaction
  const party = await prisma.$transaction(async (tx) => {
    const p = await tx.party.create({
      data: { displayName: name, type, primaryCounterpartyId: counterpartyId },
    });
    await tx.partyLink.create({
      data: { partyId: p.id, entityType: "counterparty", entityId: counterpartyId, isPrimary: true },
    });
    return p;
  });
  return party.id;
}

async function seedCounterparties() {
  console.log("\n[4] Counterparties + Parties...");

  type CPDef = { id: string; type: "supplier" | "customer"; name: string; inn: string; partyType: "person" | "organization" };
  const cpDefs: CPDef[] = [
    { id: "test-cp-sup1",  type: "supplier", name: "ООО Поставщик1",  inn: "1234567890", partyType: "organization" },
    { id: "test-cp-sup2",  type: "supplier", name: "ИП Поставщик2",   inn: "2345678901", partyType: "person" },
    { id: "test-cp-sup3",  type: "supplier", name: "ООО Электросклад", inn: "3456789012", partyType: "organization" },
    { id: "test-cp-cust1", type: "customer", name: "ИП Петров",        inn: "4567890123", partyType: "person" },
    { id: "test-cp-cust2", type: "customer", name: "ООО Ромашка",      inn: "5678901234", partyType: "organization" },
    { id: "test-cp-cust3", type: "customer", name: "Иванов ИП",        inn: "6789012345", partyType: "person" },
  ];

  for (const cp of cpDefs) {
    let counterparty = await prisma.counterparty.findFirst({ where: { inn: cp.inn } });
    if (!counterparty) {
      counterparty = await prisma.counterparty.create({
        data: {
          id: cp.id,
          tenantId: TENANT_ID,
          type: cp.type,
          name: cp.name,
          legalName: cp.name,
          inn: cp.inn,
          isActive: true,
        },
      });
    }
    await ensurePartyForCounterparty(counterparty.id, counterparty.name, cp.partyType);
  }

  console.log(`  ✓ ${cpDefs.length} counterparties + Party records`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Documents
// ─────────────────────────────────────────────────────────────────────────────

/** Generate document number using DocumentCounter (mirrors documents.ts) */
async function generateDocNumber(type: string, prefix: string): Promise<string> {
  const counter = await prisma.documentCounter.upsert({
    where: { prefix },
    update: { lastNumber: { increment: 1 } },
    create: { prefix, lastNumber: 1 },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(5, "0")}`;
}

async function createDocumentIfNeeded(
  descriptionKey: string,
  type: string,
  prefix: string,
  data: {
    tenantId: string;
    warehouseId?: string;
    targetWarehouseId?: string;
    counterpartyId?: string;
    date?: Date;
    description?: string;
    paymentType?: "cash" | "bank_transfer" | "card";
  },
  items: Array<{ productId: string; quantity: number; price: number; expectedQty?: number; actualQty?: number; difference?: number }>
) {
  // Idempotency: find by description key
  const existingDoc = await prisma.document.findFirst({
    where: { tenantId: TENANT_ID, type: type as any, description: descriptionKey },
  });
  if (existingDoc) return existingDoc;

  const number = await generateDocNumber(type, prefix);
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

  return prisma.document.create({
    data: {
      number,
      type: type as any,
      status: "draft",
      tenantId: data.tenantId,
      warehouseId: data.warehouseId ?? null,
      targetWarehouseId: data.targetWarehouseId ?? null,
      counterpartyId: data.counterpartyId ?? null,
      totalAmount: new Prisma.Decimal(totalAmount),
      date: data.date ?? new Date(),
      description: descriptionKey,
      paymentType: data.paymentType ?? null,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: new Prisma.Decimal(i.price),
          total: new Prisma.Decimal(i.quantity * i.price),
          expectedQty: i.expectedQty ?? null,
          actualQty: i.actualQty ?? null,
          difference: i.difference ?? null,
        })),
      },
    },
  });
}

async function seedDocuments() {
  console.log("\n[5] Documents...");

  // Fetch product IDs
  const getProductId = async (sku: string) => {
    const p = await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku } });
    if (!p) throw new Error(`Product not found: ${sku}`);
    return p.id;
  };

  const idIphone  = await getProductId("IPHONE-15-PRO");
  const idTV      = await getProductId("SAMSUNG-TV-55");
  const idBread   = await getProductId("BREAD-WHITE");
  const idTShirt  = await getProductId("TSHIRT-BASIC");
  const idJeans   = await getProductId("JEANS-SLIM");

  // Supplier & customer counterparty IDs (by INN)
  const sup1 = await prisma.counterparty.findFirstOrThrow({ where: { inn: "1234567890" } });
  const cust1 = await prisma.counterparty.findFirstOrThrow({ where: { inn: "4567890123" } });

  // ── 1. Incoming shipment #1 (to confirm) ──────────────────────────────────
  const ship1 = await createDocumentIfNeeded(
    "seed:ship1-electronics",
    "incoming_shipment",
    "ПР",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID, counterpartyId: sup1.id, paymentType: "bank_transfer" },
    [
      { productId: idIphone, quantity: 10, price: 65000 },
      { productId: idTV,     quantity: 5,  price: 35000 },
      { productId: idBread,  quantity: 20, price: 30 },
    ]
  );

  // ── 2. Incoming shipment #2 (to confirm) ──────────────────────────────────
  const ship2 = await createDocumentIfNeeded(
    "seed:ship2-clothes",
    "incoming_shipment",
    "ПР",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID, counterpartyId: sup1.id, paymentType: "bank_transfer" },
    [
      { productId: idTShirt, quantity: 30, price: 300 },
      { productId: idJeans,  quantity: 10, price: 1200 },
    ]
  );

  // ── 3. Outgoing shipment (sale, to confirm) ────────────────────────────────
  const shipOut1 = await createDocumentIfNeeded(
    "seed:shipout1-sale",
    "outgoing_shipment",
    "ОТ",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID, counterpartyId: cust1.id, paymentType: "bank_transfer" },
    [
      { productId: idIphone, quantity: 2, price: 89990 },
      { productId: idTV,     quantity: 1, price: 49990 },
    ]
  );

  // ── 4. Stock transfer (to confirm) ────────────────────────────────────────
  const transfer1 = await createDocumentIfNeeded(
    "seed:transfer1-clothes",
    "stock_transfer",
    "ПМ",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID, targetWarehouseId: WH_SECOND_ID },
    [
      { productId: idTShirt, quantity: 5, price: 300 },
    ]
  );

  // ── 5. Write-off (to confirm) ──────────────────────────────────────────────
  const writeOff1 = await createDocumentIfNeeded(
    "seed:writeoff1-damage",
    "write_off",
    "СП",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID },
    [
      { productId: idBread, quantity: 1, price: 30 },
    ]
  );

  // ── 6. Inventory count (DRAFT — do NOT confirm) ───────────────────────────
  const invCount = await createDocumentIfNeeded(
    "seed:inv1-count",
    "inventory_count",
    "ИН",
    { tenantId: TENANT_ID, warehouseId: WH_MAIN_ID },
    [
      { productId: idTShirt, quantity: 0, price: 300, expectedQty: 25, actualQty: 23, difference: -2 },
      { productId: idJeans,  quantity: 0, price: 1200, expectedQty: 10, actualQty: 10, difference: 0 },
    ]
  );

  // ── 7. Purchase order (DRAFT — do NOT confirm) ────────────────────────────
  await createDocumentIfNeeded(
    "seed:po1-draft",
    "purchase_order",
    "ЗП",
    { tenantId: TENANT_ID, counterpartyId: sup1.id, paymentType: "bank_transfer" },
    [
      { productId: idIphone, quantity: 5, price: 65000 },
    ]
  );

  console.log("  ✓ 7 documents created (5 to confirm, 1 inventory draft, 1 purchase order draft)");

  // ── Confirm documents using confirmDocumentTransactional ──────────────────
  // We must import services after prisma is set up
  const { confirmDocumentTransactional } = await import("../lib/modules/accounting/services/document-confirm.service");

  const toConfirm = [
    { doc: ship1,     label: "incoming_shipment #1" },
    { doc: ship2,     label: "incoming_shipment #2" },
    { doc: shipOut1,  label: "outgoing_shipment #1" },
    { doc: transfer1, label: "stock_transfer #1" },
    { doc: writeOff1, label: "write_off #1" },
  ];

  for (const { doc, label } of toConfirm) {
    // Refresh status — may already be confirmed if seed was run before
    const fresh = await prisma.document.findUnique({ where: { id: doc.id }, select: { status: true } });
    if (fresh?.status === "confirmed") {
      console.log(`  ↷ ${label} already confirmed`);
      continue;
    }
    try {
      await confirmDocumentTransactional(doc.id, "seed");
      console.log(`  ✓ Confirmed: ${label}`);
    } catch (e: any) {
      console.warn(`  ⚠ Could not confirm ${label}: ${e.message}`);
    }
  }

  // Inventory count and purchase order stay as draft
  console.log(`  ✓ inventory_count (${invCount.number}) left as draft`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Finance Payments
// ─────────────────────────────────────────────────────────────────────────────
async function seedPayments() {
  console.log("\n[6] Finance Payments...");

  const incomeCategory = await prisma.financeCategory.findFirstOrThrow({
    where: { name: "Оплата от покупателя", type: "income", isActive: true },
  });
  const expenseCategory = await prisma.financeCategory.findFirstOrThrow({
    where: { name: "Оплата поставщику", type: "expense", isActive: true },
  });

  const cust1 = await prisma.counterparty.findFirstOrThrow({ where: { inn: "4567890123" } });
  const cust2 = await prisma.counterparty.findFirstOrThrow({ where: { inn: "5678901234" } });
  const sup1  = await prisma.counterparty.findFirstOrThrow({ where: { inn: "1234567890" } });
  const sup2  = await prisma.counterparty.findFirstOrThrow({ where: { inn: "2345678901" } });

  async function ensurePayment(id: string, data: {
    type: "income" | "expense";
    categoryId: string;
    counterpartyId?: string;
    amount: number;
    description: string;
  }) {
    const existing = await prisma.payment.findUnique({ where: { id } });
    if (existing) return existing;

    // Get/increment payment counter
    const counter = await prisma.paymentCounter.update({
      where: { prefix: "PAY" },
      data: { lastNumber: { increment: 1 } },
    });
    const number = `PAY-${String(counter.lastNumber).padStart(6, "0")}`;

    return prisma.payment.create({
      data: {
        id,
        number,
        type: data.type,
        categoryId: data.categoryId,
        counterpartyId: data.counterpartyId ?? null,
        amount: new Prisma.Decimal(data.amount),
        paymentMethod: "bank_transfer",
        date: new Date(),
        description: data.description,
        tenantId: TENANT_ID,
      },
    });
  }

  await ensurePayment("test-pay-in1", { type: "income",  categoryId: incomeCategory.id,  counterpartyId: cust1.id, amount: 229970, description: "Оплата от ИП Петров"   });
  await ensurePayment("test-pay-in2", { type: "income",  categoryId: incomeCategory.id,  counterpartyId: cust2.id, amount: 50000,  description: "Оплата от ООО Ромашка" });
  await ensurePayment("test-pay-in3", { type: "income",  categoryId: incomeCategory.id,  amount: 15000, description: "Прочий доход" });
  await ensurePayment("test-pay-out1", { type: "expense", categoryId: expenseCategory.id, counterpartyId: sup1.id, amount: 825600, description: "Оплата ООО Поставщик1"  });
  await ensurePayment("test-pay-out2", { type: "expense", categoryId: expenseCategory.id, counterpartyId: sup2.id, amount: 120000, description: "Оплата ИП Поставщик2"   });

  console.log("  ✓ 5 payments (3 income, 2 expense)");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: E-commerce
// ─────────────────────────────────────────────────────────────────────────────
async function seedEcommerce() {
  console.log("\n[7] E-commerce...");

  // Ensure OrderCounter exists
  await prisma.orderCounter.upsert({
    where: { prefix: "ORD" },
    update: {},
    create: { prefix: "ORD", lastNumber: 0 },
  });

  // Customers
  const customerDefs = [
    { telegramId: "100001", name: "Тест Покупатель 1", telegramUsername: "test_buyer1" },
    { telegramId: "100002", name: "Тест Покупатель 2", telegramUsername: "test_buyer2" },
    { telegramId: "100003", name: "Тест Покупатель 3", telegramUsername: "test_buyer3" },
  ];

  const customers = [];
  for (const cd of customerDefs) {
    const c = await prisma.customer.upsert({
      where: { telegramId: cd.telegramId },
      update: { name: cd.name },
      create: { telegramId: cd.telegramId, name: cd.name, telegramUsername: cd.telegramUsername, isActive: true },
    });
    customers.push(c);

    // Create Party + PartyLink for customer
    const existingLink = await prisma.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "customer", entityId: c.id } },
    });
    if (!existingLink) {
      const existingParty = await prisma.party.findUnique({ where: { primaryCustomerId: c.id } });
      if (!existingParty) {
        await prisma.$transaction(async (tx) => {
          const p = await tx.party.create({
            data: { displayName: c.name ?? cd.name, type: "person", primaryCustomerId: c.id },
          });
          await tx.partyLink.create({
            data: { partyId: p.id, entityType: "customer", entityId: c.id, isPrimary: true },
          });
        });
      }
    }
  }
  console.log("  ✓ 3 customers + Party records");

  // Cart items for customer[0]
  const customer1 = customers[0];
  const productIds = [
    (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "IPHONE-15-PRO" } }))!.id,
    (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "TSHIRT-BASIC" } }))!.id,
    (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "MILK-32" } }))!.id,
  ];

  for (const pid of productIds) {
    const salePrice = await prisma.salePrice.findFirst({
      where: { productId: pid, isActive: true, priceListId: null },
    });
    const priceSnapshot = salePrice?.price ?? new Prisma.Decimal(100);

    const existingCartItem = await prisma.cartItem.findFirst({
      where: { customerId: customer1.id, productId: pid, variantId: null },
    });
    if (!existingCartItem) {
      await prisma.cartItem.create({
        data: { customerId: customer1.id, productId: pid, quantity: 1, priceSnapshot },
      });
    }
  }
  console.log("  ✓ 3 cart items for customer 1");

  // Orders in different statuses
  const orderStatuses: Array<{ status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled", customer: typeof customers[0] }> = [
    { status: "pending",   customer: customers[0] },
    { status: "processing", customer: customers[0] },
    { status: "shipped",   customer: customers[1] },
    { status: "delivered", customer: customers[1] },
    { status: "cancelled", customer: customers[2] },
  ];

  const orderProductId = (await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: "CHEESE-RUS" } }))!.id;

  for (let i = 0; i < orderStatuses.length; i++) {
    const { status, customer } = orderStatuses[i];
    const orderNum = `ORD-TEST-${String(i + 1).padStart(3, "0")}`;

    const existingOrder = await prisma.order.findUnique({ where: { orderNumber: orderNum } });
    if (!existingOrder) {
      await prisma.order.create({
        data: {
          orderNumber: orderNum,
          customerId: customer.id,
          status,
          deliveryType: "pickup",
          totalAmount: new Prisma.Decimal(490),
          paymentMethod: "cash",
          paymentStatus: status === "delivered" ? "paid" : "pending",
          items: {
            create: [{ productId: orderProductId, quantity: 1, price: new Prisma.Decimal(490), total: new Prisma.Decimal(490) }],
          },
        },
      });
    }
  }
  console.log("  ✓ 5 orders (pending/processing/shipped/delivered/cancelled)");

  // Reviews
  const reviewDefs = [
    { productSku: "IPHONE-15-PRO", customer: customers[0], rating: 5, title: "Отличный телефон!", comment: "Всё супер" },
    { productSku: "TSHIRT-BASIC",  customer: customers[1], rating: 4, title: "Хорошая футболка",   comment: "Качество норм"  },
    { productSku: "BREAD-WHITE",   customer: customers[2], rating: 3, title: "Обычный хлеб",        comment: "Нормально"     },
  ];

  for (const r of reviewDefs) {
    const product = await prisma.product.findFirst({ where: { tenantId: TENANT_ID, sku: r.productSku } });
    if (!product) continue;
    const existing = await prisma.review.findFirst({ where: { productId: product.id, customerId: r.customer.id } });
    if (!existing) {
      await prisma.review.create({
        data: {
          productId: product.id,
          customerId: r.customer.id,
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          isPublished: true,
          isVerifiedPurchase: false,
        },
      });
    }
  }
  console.log("  ✓ 3 reviews");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: CRM Activities
// ─────────────────────────────────────────────────────────────────────────────
async function seedCrmActivities() {
  console.log("\n[8] CRM Activities...");

  const cpInns = ["1234567890", "4567890123", "5678901234"];
  const activityTypes = ["call", "meeting", "task"];

  for (let i = 0; i < cpInns.length; i++) {
    const cp = await prisma.counterparty.findFirstOrThrow({ where: { inn: cpInns[i] } });

    // Get the party for this counterparty
    const partyLink = await prisma.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: cp.id } },
    });
    if (!partyLink) continue;

    const sourceId = `seed-activity-${cp.id}`;
    const actType = activityTypes[i];

    const existing = await prisma.partyActivity.findUnique({
      where: { sourceType_sourceId_type: { sourceType: "seed", sourceId, type: actType } },
    });
    if (!existing) {
      await prisma.partyActivity.create({
        data: {
          partyId: partyLink.partyId,
          type: actType,
          occurredAt: new Date(),
          sourceType: "seed",
          sourceId,
          summary: { note: `Тестовая активность: ${actType} для ${cp.name}` },
        },
      });
    }
  }
  console.log("  ✓ 3 PartyActivity records (call/meeting/task)");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Process outbox events + re-post payments without journal entries
// ─────────────────────────────────────────────────────────────────────────────
async function processOutbox() {
  console.log("\n[9] Processing outbox events...");

  // Register handlers (mirrors app/api/system/outbox/process/route.ts)
  const { processOutboxEvents, registerOutboxHandler } = await import("../lib/events/outbox");
  const { onDocumentConfirmedBalance } = await import("../lib/modules/accounting/handlers/balance-handler");
  const { onDocumentConfirmedJournal } = await import("../lib/modules/accounting/handlers/journal-handler");
  const { onDocumentConfirmedPayment } = await import("../lib/modules/accounting/handlers/payment-handler");
  const { onProductCatalogUpdated } = await import("../lib/modules/ecommerce/handlers");

  // Register handlers (idempotent — they accumulate but processEvent calls all)
  registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedBalance as any);
  registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedJournal as any);
  registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedPayment as any);
  registerOutboxHandler("product.updated",   onProductCatalogUpdated as any);
  registerOutboxHandler("sale_price.updated", onProductCatalogUpdated as any);
  registerOutboxHandler("discount.updated",   onProductCatalogUpdated as any);

  // Process in batches until queue is empty
  let totalProcessed = 0;
  let totalFailed = 0;
  let batchNum = 0;

  while (true) {
    const result = await processOutboxEvents(20);
    totalProcessed += result.processed;
    totalFailed    += result.failed;
    batchNum++;

    if (result.claimed === 0) break;
    if (batchNum > 20) {
      console.warn("  ⚠ Outbox: too many batches, stopping");
      break;
    }
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.warn(`  ⚠ Outbox event ${err.eventId}: ${err.error}`);
      }
    }
  }

  console.log(`  ✓ Outbox processed: ${totalProcessed} ok, ${totalFailed} failed`);

  // ── Re-post confirmed documents that still have no journal entry ──────────
  // This handles the case where documents were confirmed BEFORE accounts existed.
  console.log("  → Re-posting confirmed documents without journal entries...");
  const { autoPostDocument } = await import("../lib/modules/accounting/finance/journal");

  const confirmedDocs = await prisma.document.findMany({
    where: { tenantId: TENANT_ID, status: "confirmed" },
    select: { id: true, number: true, date: true },
  });

  let reposted = 0;
  for (const doc of confirmedDocs) {
    // autoPostDocument is already idempotent (checks for existing entry)
    try {
      await autoPostDocument(doc.id, doc.number, doc.date, "seed");
      reposted++;
    } catch (e: any) {
      console.warn(`  ⚠ Re-post doc ${doc.number}: ${e.message}`);
    }
  }
  console.log(`  ✓ Re-posted ${reposted} confirmed documents to journal`);

  // ── Auto-post Finance Payments that have no journal entry yet ─────────────
  // Payments created in Section 6 were created before accounts existed.
  console.log("  → Auto-posting finance payments without journal entries...");
  const { autoPostPayment } = await import("../lib/modules/accounting/finance/journal");

  const allPayments = await prisma.payment.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, number: true },
  });

  let paymentsPosted = 0;
  for (const pay of allPayments) {
    // Check if already has a journal entry
    const existing = await prisma.journalEntry.findFirst({
      where: { sourceId: pay.id, sourceType: "finance_payment", isReversed: false },
    });
    if (!existing) {
      try {
        await autoPostPayment(pay.id);
        paymentsPosted++;
      } catch (e: any) {
        console.warn(`  ⚠ Auto-post payment ${pay.number}: ${e.message}`);
      }
    }
  }
  console.log(`  ✓ Auto-posted ${paymentsPosted} finance payments to journal`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Rebuild ProductCatalogProjection
// ─────────────────────────────────────────────────────────────────────────────
async function rebuildProjections() {
  console.log("\n[10] Rebuilding ProductCatalogProjection...");

  const { updateProductCatalogProjection } = await import(
    "../lib/modules/ecommerce/projections/product-catalog.projection"
  );

  // All active+published products in our tenant
  const products = await prisma.product.findMany({
    where: { tenantId: TENANT_ID, isActive: true, publishedToStore: true },
    select: { id: true, name: true },
  });

  for (const p of products) {
    await updateProductCatalogProjection(p.id);
  }

  console.log(`  ✓ Rebuilt projection for ${products.length} active+published products`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: Verification
// ─────────────────────────────────────────────────────────────────────────────
async function runVerifications() {
  console.log("\n=== VERIFICATION RESULTS ===\n");

  // ── Check 1: Stock conservation ──────────────────────────────────────────
  // For each (productId, warehouseId): SUM of movements (positive is increase,
  // negative is decrease) should match StockRecord.quantity
  console.log("Check 1: Stock conservation");
  try {
    const movements = await prisma.stockMovement.groupBy({
      by: ["productId", "warehouseId"],
      _sum: { quantity: true },
    });

    let stockOk = 0;
    let stockMismatch = 0;

    for (const m of movements) {
      const record = await prisma.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: m.warehouseId, productId: m.productId } },
      });
      const movSum = m._sum.quantity ?? 0;
      const recQty = record?.quantity ?? 0;
      // Allow floating point tolerance
      if (Math.abs(movSum - recQty) < 0.001) {
        stockOk++;
      } else {
        stockMismatch++;
        console.warn(`  ⚠ Mismatch productId=${m.productId} wh=${m.warehouseId}: movements=${movSum} record=${recQty}`);
      }
    }
    console.log(`  ${stockMismatch === 0 ? "✓ PASS" : "✗ FAIL"}: ${stockOk} pairs match, ${stockMismatch} mismatch`);
  } catch (e: any) {
    console.error(`  ✗ Check 1 error: ${e.message}`);
  }

  // ── Check 2: Double-entry balance ────────────────────────────────────────
  // SUM(debit) should equal SUM(credit) across all LedgerLines
  console.log("\nCheck 2: Double-entry balance (SUM debit = SUM credit)");
  try {
    const agg = await prisma.ledgerLine.aggregate({ _sum: { debit: true, credit: true } });
    const totalDebit  = toNumber(agg._sum.debit);
    const totalCredit = toNumber(agg._sum.credit);
    const diff = Math.abs(totalDebit - totalCredit);
    const pass = diff < 0.01;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: debit=${totalDebit.toFixed(2)}, credit=${totalCredit.toFixed(2)}, diff=${diff.toFixed(4)}`);
  } catch (e: any) {
    console.error(`  ✗ Check 2 error: ${e.message}`);
  }

  // ── Check 3: Projection coverage ─────────────────────────────────────────
  // Count active+publishedToStore products vs ProjectionCatalogProjection rows
  console.log("\nCheck 3: ProjectionCatalogProjection coverage");
  try {
    const productCount = await prisma.product.count({
      where: { tenantId: TENANT_ID, isActive: true, publishedToStore: true },
    });
    const projCount = await prisma.productCatalogProjection.count({
      where: { tenantId: TENANT_ID, isActive: true, publishedToStore: true },
    });
    const pass = productCount === projCount && productCount > 0;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: active+published products=${productCount}, projections=${projCount}`);
  } catch (e: any) {
    console.error(`  ✗ Check 3 error: ${e.message}`);
  }

  // ── Check 4: Party coverage ───────────────────────────────────────────────
  // Every counterparty in our tenant should have a PartyLink
  console.log("\nCheck 4: Party coverage for counterparties");
  try {
    const allCps = await prisma.counterparty.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } });
    let covered = 0;
    for (const cp of allCps) {
      const link = await prisma.partyLink.findUnique({
        where: { entityType_entityId: { entityType: "counterparty", entityId: cp.id } },
      });
      if (link) covered++;
    }
    const pass = covered === allCps.length && allCps.length > 0;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: ${covered}/${allCps.length} counterparties have Party records`);
  } catch (e: any) {
    console.error(`  ✗ Check 4 error: ${e.message}`);
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  console.log("\n── Summary ──────────────────────────────────────────");
  const docTotal  = await prisma.document.count({ where: { tenantId: TENANT_ID } });
  const docConf   = await prisma.document.count({ where: { tenantId: TENANT_ID, status: "confirmed" } });
  const docDraft  = await prisma.document.count({ where: { tenantId: TENANT_ID, status: "draft" } });
  const prodTotal = await prisma.product.count({ where: { tenantId: TENANT_ID } });
  const stockMov  = await prisma.stockMovement.count();
  const stockRec  = await prisma.stockRecord.count();
  const ledger    = await prisma.ledgerLine.count();
  const parties   = await prisma.party.count();
  const orders    = await prisma.order.count();

  console.log(`  Tenant:         ООО ТестКомпания (${TENANT_ID})`);
  console.log(`  Products:       ${prodTotal}`);
  console.log(`  Documents:      ${docTotal} total (${docConf} confirmed, ${docDraft} draft)`);
  console.log(`  StockMovements: ${stockMov}`);
  console.log(`  StockRecords:   ${stockRec}`);
  console.log(`  LedgerLines:    ${ledger}`);
  console.log(`  Parties:        ${parties}`);
  console.log(`  Orders:         ${orders}`);

  console.log("\n=== END VERIFICATION ===\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== seed-test-data.ts starting ===");

  await seedTenantAndUsers();
  await seedChartOfAccounts();
  await seedCatalog();
  await seedWarehouses();
  await seedCounterparties();
  await seedDocuments();
  await seedPayments();
  await seedEcommerce();
  await seedCrmActivities();
  await processOutbox();
  await rebuildProjections();
  await runVerifications();

  console.log("=== seed-test-data.ts complete ===");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

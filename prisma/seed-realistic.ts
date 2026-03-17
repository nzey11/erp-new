/**
 * seed-realistic.ts
 *
 * Realistic business-chain seed for the DEFAULT tenant.
 * Runs a complete purchase→sale cycle with full journal/stock/balance effects.
 *
 * Steps:
 *   0. Clean up test-company tenant (if exists)
 *   1. Ensure chart of accounts + TenantSettings mappings
 *   2. Seed warehouse, products, counterparties
 *   3. Business chain: purchase_order → incoming_shipment → payment_out
 *                       → sales_order  → outgoing_shipment  → payment_in
 *   4. Process outbox (journal, balance, payment handlers)
 *   5. E-commerce order
 *   6. Party activities
 *   7. Rebuild ProductCatalogProjection
 *   8. Verifications
 *
 * IDEMPOTENT — safe to run multiple times.
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";
import { AccountType, AccountCategory } from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ── Prisma client setup ────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === "number" ? val : Number(val);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 0 — Clean up test-company tenant
// ─────────────────────────────────────────────────────────────────────────────
async function cleanupTestTenant(): Promise<void> {
  console.log("\n[0] Cleaning up test-company tenant...");

  const testTenant = await prisma.tenant.findUnique({ where: { slug: "test-company" } });
  if (!testTenant) {
    console.log("  ↷ test-company tenant not found, skipping cleanup");
    return;
  }

  const tid = testTenant.id;
  console.log(`  Found tenant id=${tid}`);

  // 1. Collect IDs we need for scoped deletes
  const testCounterparties = await prisma.counterparty.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const testCpIds = testCounterparties.map((c) => c.id);

  const testProducts = await prisma.product.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const testProductIds = testProducts.map((p) => p.id);

  const testDocuments = await prisma.document.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const testDocIds = testDocuments.map((d) => d.id);

  const testPayments = await prisma.payment.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const testPaymentIds = testPayments.map((p) => p.id);

  const testWarehouses = await prisma.warehouse.findMany({
    where: { tenantId: tid },
    select: { id: true },
  });
  const testWarehouseIds = testWarehouses.map((w) => w.id);

  // Collect customer IDs linked to test-company (via partyLink with sourceType=Customer
  // but Customer has no tenantId — identify through orders or reviews referencing test products)
  // Since Customer is global, we only delete customers created specifically for test seeds
  // (telegramId 100001-100003 as used in seed-test-data.ts)
  const testCustomers = await prisma.customer.findMany({
    where: { telegramId: { in: ["100001", "100002", "100003"] } },
    select: { id: true },
  });
  const testCustomerIds = testCustomers.map((c) => c.id);

  // 2. PartyActivity for test counterparties
  if (testCpIds.length > 0) {
    const cpPartyLinks = await prisma.partyLink.findMany({
      where: { entityType: "counterparty", entityId: { in: testCpIds } },
      select: { partyId: true },
    });
    const cpPartyIds = cpPartyLinks.map((l) => l.partyId);
    if (cpPartyIds.length > 0) {
      const r = await prisma.partyActivity.deleteMany({ where: { partyId: { in: cpPartyIds } } });
      if (r.count > 0) console.log(`  ✓ Deleted ${r.count} PartyActivity (counterparties)`);
    }
  }

  // PartyActivity for test customers
  if (testCustomerIds.length > 0) {
    const custPartyLinks = await prisma.partyLink.findMany({
      where: { entityType: "customer", entityId: { in: testCustomerIds } },
      select: { partyId: true },
    });
    const custPartyIds = custPartyLinks.map((l) => l.partyId);
    if (custPartyIds.length > 0) {
      const r = await prisma.partyActivity.deleteMany({ where: { partyId: { in: custPartyIds } } });
      if (r.count > 0) console.log(`  ✓ Deleted ${r.count} PartyActivity (customers)`);
    }
  }

  // 3. PartyLink for test counterparties and customers
  if (testCpIds.length > 0) {
    const r = await prisma.partyLink.deleteMany({
      where: { entityType: "counterparty", entityId: { in: testCpIds } },
    });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} PartyLink (counterparties)`);
  }
  if (testCustomerIds.length > 0) {
    const r = await prisma.partyLink.deleteMany({
      where: { entityType: "customer", entityId: { in: testCustomerIds } },
    });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} PartyLink (customers)`);
  }

  // 4. CartItem for test customers
  if (testCustomerIds.length > 0) {
    const r = await prisma.cartItem.deleteMany({ where: { customerId: { in: testCustomerIds } } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} CartItem`);
  }

  // 5. Reviews for test customers / test products
  const reviewWhere: Prisma.ReviewWhereInput = { OR: [] };
  if (testCustomerIds.length > 0) (reviewWhere.OR as any[]).push({ customerId: { in: testCustomerIds } });
  if (testProductIds.length > 0) (reviewWhere.OR as any[]).push({ productId: { in: testProductIds } });
  if ((reviewWhere.OR as any[]).length > 0) {
    const r = await prisma.review.deleteMany({ where: reviewWhere });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Review`);
  }

  // 6. OrderItem / Order for test customers
  if (testCustomerIds.length > 0) {
    const testOrders = await prisma.order.findMany({
      where: { customerId: { in: testCustomerIds } },
      select: { id: true },
    });
    const testOrderIds = testOrders.map((o) => o.id);
    if (testOrderIds.length > 0) {
      const ri = await prisma.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
      if (ri.count > 0) console.log(`  ✓ Deleted ${ri.count} OrderItem`);
      const ro = await prisma.order.deleteMany({ where: { id: { in: testOrderIds } } });
      if (ro.count > 0) console.log(`  ✓ Deleted ${ro.count} Order`);
    }
  }

  // 7. ProductCatalogProjection for test products
  if (testProductIds.length > 0) {
    const r = await prisma.productCatalogProjection.deleteMany({
      where: { productId: { in: testProductIds } },
    });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} ProductCatalogProjection`);
  }

  // 8. OutboxEvent for test documents/products
  const outboxAggIds = [...testDocIds, ...testProductIds, ...testPaymentIds];
  if (outboxAggIds.length > 0) {
    const r = await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: outboxAggIds } },
    });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} OutboxEvent`);
  }

  // 9. StockMovement for test warehouses / documents
  const stockMovWhere: Prisma.StockMovementWhereInput = { OR: [] };
  if (testDocIds.length > 0) (stockMovWhere.OR as any[]).push({ documentId: { in: testDocIds } });
  if (testWarehouseIds.length > 0) (stockMovWhere.OR as any[]).push({ warehouseId: { in: testWarehouseIds } });
  if ((stockMovWhere.OR as any[]).length > 0) {
    const r = await prisma.stockMovement.deleteMany({ where: stockMovWhere });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} StockMovement`);
  }

  // 10. StockRecord for test warehouses
  if (testWarehouseIds.length > 0) {
    const r = await prisma.stockRecord.deleteMany({ where: { warehouseId: { in: testWarehouseIds } } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} StockRecord`);
  }

  // 11. DocumentItem (via cascade on Document — but let's be explicit)
  if (testDocIds.length > 0) {
    const r = await prisma.documentItem.deleteMany({ where: { documentId: { in: testDocIds } } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} DocumentItem`);
  }

  // 12. LedgerLine / JournalEntry for test documents/payments
  const jeSourceIds = [...testDocIds, ...testPaymentIds];
  if (jeSourceIds.length > 0) {
    // LedgerLine cascades from JournalEntry
    const entries = await prisma.journalEntry.findMany({
      where: { sourceId: { in: jeSourceIds } },
      select: { id: true },
    });
    const entryIds = entries.map((e) => e.id);
    if (entryIds.length > 0) {
      // LedgerLine cascades automatically
      const r = await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
      if (r.count > 0) console.log(`  ✓ Deleted ${r.count} JournalEntry (+ LedgerLines cascade)`);
    }
  }

  // 13. Documents
  if (testDocIds.length > 0) {
    const r = await prisma.document.deleteMany({ where: { tenantId: tid } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Document`);
  }

  // 14. Payments
  if (testPaymentIds.length > 0) {
    const r = await prisma.payment.deleteMany({ where: { tenantId: tid } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Payment`);
  }

  // 15. CounterpartyBalance / CounterpartyInteraction for test counterparties
  if (testCpIds.length > 0) {
    const rb = await prisma.counterpartyBalance.deleteMany({ where: { counterpartyId: { in: testCpIds } } });
    if (rb.count > 0) console.log(`  ✓ Deleted ${rb.count} CounterpartyBalance`);
    const ri = await prisma.counterpartyInteraction.deleteMany({ where: { counterpartyId: { in: testCpIds } } });
    if (ri.count > 0) console.log(`  ✓ Deleted ${ri.count} CounterpartyInteraction`);
  }

  // 16. SalePrice / PurchasePrice / ProductDiscount for test products
  if (testProductIds.length > 0) {
    const rs = await prisma.salePrice.deleteMany({ where: { productId: { in: testProductIds } } });
    if (rs.count > 0) console.log(`  ✓ Deleted ${rs.count} SalePrice`);
    const rp = await prisma.purchasePrice.deleteMany({ where: { productId: { in: testProductIds } } });
    if (rp.count > 0) console.log(`  ✓ Deleted ${rp.count} PurchasePrice`);
    const rd = await prisma.productDiscount.deleteMany({ where: { productId: { in: testProductIds } } });
    if (rd.count > 0) console.log(`  ✓ Deleted ${rd.count} ProductDiscount`);
    const rv = await prisma.productVariant.deleteMany({ where: { tenantId: tid } });
    if (rv.count > 0) console.log(`  ✓ Deleted ${rv.count} ProductVariant`);
  }

  // 17. Party records for test counterparties (after PartyLink is gone)
  if (testCpIds.length > 0) {
    const r = await prisma.party.deleteMany({ where: { primaryCounterpartyId: { in: testCpIds } } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Party (counterparties)`);
  }

  // 18. Party records for test customers
  if (testCustomerIds.length > 0) {
    const r = await prisma.party.deleteMany({ where: { primaryCustomerId: { in: testCustomerIds } } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Party (customers)`);
    // Delete customers themselves
    const rc = await prisma.customer.deleteMany({ where: { id: { in: testCustomerIds } } });
    if (rc.count > 0) console.log(`  ✓ Deleted ${rc.count} Customer`);
  }

  // 19. Products
  if (testProductIds.length > 0) {
    const r = await prisma.product.deleteMany({ where: { tenantId: tid } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Product`);
  }

  // 20. Warehouses
  if (testWarehouseIds.length > 0) {
    const r = await prisma.warehouse.deleteMany({ where: { tenantId: tid } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Warehouse`);
  }

  // 21. Counterparties
  if (testCpIds.length > 0) {
    const r = await prisma.counterparty.deleteMany({ where: { tenantId: tid } });
    if (r.count > 0) console.log(`  ✓ Deleted ${r.count} Counterparty`);
  }

  // 22. ProductCategory (no tenantId — global; only delete ids that were created specifically)
  // We check known test category IDs from seed-test-data.ts
  const testCatIds = ["test-cat-electronics", "test-cat-clothes", "test-cat-food"];
  const rc = await prisma.productCategory.deleteMany({ where: { id: { in: testCatIds } } });
  if (rc.count > 0) console.log(`  ✓ Deleted ${rc.count} ProductCategory`);

  // 23. TenantSettings (cascade from tenant delete, but explicit for safety)
  await prisma.tenantSettings.deleteMany({ where: { tenantId: tid } });

  // 24. TenantMembership
  const testUsers = await prisma.user.findMany({
    where: { username: { in: ["test_admin", "test_manager", "test_warehouse"] } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);
  if (testUserIds.length > 0) {
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tid } });
    // Delete users that ONLY belong to test-company (not default tenant)
    for (const uid of testUserIds) {
      const membershipCount = await prisma.tenantMembership.count({ where: { userId: uid } });
      if (membershipCount === 0) {
        await prisma.user.delete({ where: { id: uid } }).catch(() => {});
      }
    }
  }

  // 25. Delete the tenant itself
  await prisma.tenant.delete({ where: { id: tid } });
  console.log(`  ✓ Tenant «ООО ТестКомпания» (${tid}) deleted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS_SEED (same as seed-test-data.ts)
// ─────────────────────────────────────────────────────────────────────────────
const ACCOUNTS_SEED = [
  { code: "01",    name: "Основные средства",                              type: AccountType.active,         category: AccountCategory.asset,     order: 100 },
  { code: "02",    name: "Амортизация основных средств",                   type: AccountType.passive,        category: AccountCategory.asset,     order: 110 },
  { code: "04",    name: "Нематериальные активы",                          type: AccountType.active,         category: AccountCategory.asset,     order: 120 },
  { code: "05",    name: "Амортизация нематериальных активов",             type: AccountType.passive,        category: AccountCategory.asset,     order: 130 },
  { code: "10",    name: "Материалы",                                      type: AccountType.active,         category: AccountCategory.asset,     order: 200 },
  { code: "19",    name: "НДС по приобретенным ценностям",                 type: AccountType.active,         category: AccountCategory.asset,     order: 290, analyticsType: "counterparty" },
  { code: "41",    name: "Товары",                                         type: AccountType.active,         category: AccountCategory.asset,     order: 400 },
  { code: "41.1",  name: "Товары на складах",                              type: AccountType.active,         category: AccountCategory.asset,     order: 401, analyticsType: "warehouse" },
  { code: "41.2",  name: "Товары в розничной торговле",                    type: AccountType.active,         category: AccountCategory.asset,     order: 402, analyticsType: "warehouse" },
  { code: "41.3",  name: "Тара под товаром и порожняя",                    type: AccountType.active,         category: AccountCategory.asset,     order: 403 },
  { code: "42",    name: "Торговая наценка",                               type: AccountType.passive,        category: AccountCategory.asset,     order: 410 },
  { code: "44",    name: "Расходы на продажу",                             type: AccountType.active,         category: AccountCategory.expense,   order: 420 },
  { code: "45",    name: "Товары отгруженные",                             type: AccountType.active,         category: AccountCategory.asset,     order: 430 },
  { code: "50",    name: "Касса",                                          type: AccountType.active,         category: AccountCategory.asset,     order: 500 },
  { code: "50.1",  name: "Касса организации",                              type: AccountType.active,         category: AccountCategory.asset,     order: 501 },
  { code: "51",    name: "Расчетные счета",                                type: AccountType.active,         category: AccountCategory.asset,     order: 510 },
  { code: "52",    name: "Валютные счета",                                 type: AccountType.active,         category: AccountCategory.asset,     order: 520 },
  { code: "57",    name: "Переводы в пути",                                type: AccountType.active,         category: AccountCategory.asset,     order: 570 },
  { code: "60",    name: "Расчеты с поставщиками и подрядчиками",         type: AccountType.active_passive, category: AccountCategory.liability, order: 600, analyticsType: "counterparty" },
  { code: "62",    name: "Расчеты с покупателями и заказчиками",          type: AccountType.active_passive, category: AccountCategory.asset,     order: 620, analyticsType: "counterparty" },
  { code: "66",    name: "Расчеты по краткосрочным кредитам и займам",    type: AccountType.active_passive, category: AccountCategory.liability, order: 660 },
  { code: "67",    name: "Расчеты по долгосрочным кредитам и займам",     type: AccountType.active_passive, category: AccountCategory.liability, order: 670 },
  { code: "68",    name: "Расчеты по налогам и сборам",                   type: AccountType.active_passive, category: AccountCategory.liability, order: 680 },
  { code: "68.01", name: "НДФЛ",                                           type: AccountType.active_passive, category: AccountCategory.liability, order: 681 },
  { code: "68.02", name: "НДС",                                            type: AccountType.active_passive, category: AccountCategory.liability, order: 682 },
  { code: "68.04", name: "Налог на прибыль",                              type: AccountType.active_passive, category: AccountCategory.liability, order: 684 },
  { code: "69",    name: "Расчеты по социальному страхованию",            type: AccountType.active_passive, category: AccountCategory.liability, order: 690 },
  { code: "70",    name: "Расчеты с персоналом по оплате труда",          type: AccountType.active_passive, category: AccountCategory.liability, order: 700 },
  { code: "71",    name: "Расчеты с подотчетными лицами",                 type: AccountType.active_passive, category: AccountCategory.liability, order: 710 },
  { code: "73",    name: "Расчеты с персоналом по прочим операциям",      type: AccountType.active_passive, category: AccountCategory.liability, order: 730 },
  { code: "76",    name: "Расчеты с разными дебиторами и кредиторами",    type: AccountType.active_passive, category: AccountCategory.liability, order: 760 },
  { code: "80",    name: "Уставный капитал",                              type: AccountType.passive,        category: AccountCategory.equity,    order: 800 },
  { code: "82",    name: "Резервный капитал",                             type: AccountType.passive,        category: AccountCategory.equity,    order: 820 },
  { code: "83",    name: "Добавочный капитал",                            type: AccountType.passive,        category: AccountCategory.equity,    order: 830 },
  { code: "84",    name: "Нераспределенная прибыль (непокрытый убыток)",  type: AccountType.active_passive, category: AccountCategory.equity,    order: 840 },
  { code: "84.1",  name: "Нераспределенная прибыль отчетного года",       type: AccountType.passive,        category: AccountCategory.equity,    order: 841 },
  { code: "84.2",  name: "Непокрытый убыток отчетного года",              type: AccountType.active,         category: AccountCategory.equity,    order: 842 },
  { code: "90",    name: "Продажи",                                        type: AccountType.active_passive, category: AccountCategory.income,    order: 900 },
  { code: "90.1",  name: "Выручка",                                        type: AccountType.passive,        category: AccountCategory.income,    order: 901 },
  { code: "90.2",  name: "Себестоимость продаж",                           type: AccountType.active,         category: AccountCategory.expense,   order: 902 },
  { code: "90.3",  name: "НДС",                                            type: AccountType.active,         category: AccountCategory.expense,   order: 903 },
  { code: "90.9",  name: "Прибыль/убыток от продаж",                       type: AccountType.active_passive, category: AccountCategory.income,    order: 909 },
  { code: "91",    name: "Прочие доходы и расходы",                        type: AccountType.active_passive, category: AccountCategory.income,    order: 910 },
  { code: "91.1",  name: "Прочие доходы",                                  type: AccountType.passive,        category: AccountCategory.income,    order: 911 },
  { code: "91.2",  name: "Прочие расходы",                                 type: AccountType.active,         category: AccountCategory.expense,   order: 912 },
  { code: "91.9",  name: "Сальдо прочих доходов и расходов",               type: AccountType.active_passive, category: AccountCategory.income,    order: 919 },
  { code: "94",    name: "Недостачи и потери от порчи ценностей",          type: AccountType.active,         category: AccountCategory.expense,   order: 940 },
  { code: "96",    name: "Резервы предстоящих расходов",                   type: AccountType.passive,        category: AccountCategory.liability, order: 960 },
  { code: "97",    name: "Расходы будущих периодов",                       type: AccountType.active,         category: AccountCategory.asset,     order: 970 },
  { code: "99",    name: "Прибыли и убытки",                               type: AccountType.active_passive, category: AccountCategory.equity,    order: 990 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Ensure chart of accounts + TenantSettings mappings
// ─────────────────────────────────────────────────────────────────────────────
async function seedChartOfAccounts(tenantId: string): Promise<void> {
  console.log("\n[1] Chart of accounts...");

  // JournalCounter
  await prisma.journalCounter.upsert({
    where: { prefix: "JE" },
    create: { prefix: "JE", lastNumber: 0 },
    update: {},
  });

  // Upsert accounts: parents first, then sub-accounts
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
  console.log(`  ✓ ${ACCOUNTS_SEED.length} accounts upserted`);

  // Map account IDs into TenantSettings
  const [cashAcc, bankAcc, inventoryAcc, supplierAcc, customerAcc,
    vatAcc, vatPayableAcc, salesAcc, cogsAcc, profitAcc, retainedAcc] = await Promise.all([
    prisma.account.findUnique({ where: { code: "50"    } }),
    prisma.account.findUnique({ where: { code: "51"    } }),
    prisma.account.findUnique({ where: { code: "41.1"  } }),
    prisma.account.findUnique({ where: { code: "60"    } }),
    prisma.account.findUnique({ where: { code: "62"    } }),
    prisma.account.findUnique({ where: { code: "19"    } }),
    prisma.account.findUnique({ where: { code: "68.02" } }),
    prisma.account.findUnique({ where: { code: "90.1"  } }),
    prisma.account.findUnique({ where: { code: "90.2"  } }),
    prisma.account.findUnique({ where: { code: "99"    } }),
    prisma.account.findUnique({ where: { code: "84"    } }),
  ]);

  await prisma.tenantSettings.update({
    where: { tenantId },
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

  console.log("  ✓ TenantSettings account mappings updated");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2a — Warehouse
// ─────────────────────────────────────────────────────────────────────────────
async function seedWarehouse(tenantId: string) {
  console.log("\n[2a] Warehouse...");

  const wh = await prisma.warehouse.upsert({
    where: { id: "realistic-wh-main" },
    update: { name: "Основной склад" },
    create: {
      id: "realistic-wh-main",
      tenantId,
      name: "Основной склад",
      address: "г. Москва, ул. Реалистичная, 1",
      responsibleName: "Кладовщик",
      isActive: true,
    },
  });

  console.log(`  ✓ Warehouse «${wh.name}»`);
  return wh;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2b — Products
// ─────────────────────────────────────────────────────────────────────────────
async function seedProducts(tenantId: string) {
  console.log("\n[2b] Products...");

  const unitSht = await prisma.unit.findUniqueOrThrow({ where: { shortName: "шт" } });

  // Category
  const catElectronics = await prisma.productCategory.upsert({
    where: { id: "realistic-cat-electronics" },
    update: { name: "Электроника" },
    create: { id: "realistic-cat-electronics", name: "Электроника", order: 10, isActive: true },
  });

  // ── Laptop ────────────────────────────────────────────────────────────────
  let laptop = await prisma.product.findFirst({ where: { tenantId, sku: "NB-001" } });
  if (!laptop) {
    laptop = await prisma.product.create({
      data: {
        tenantId,
        name: "Ноутбук Lenovo ThinkPad",
        sku: "NB-001",
        unitId: unitSht.id,
        categoryId: catElectronics.id,
        isActive: true,
        publishedToStore: true,
      },
    });
  } else {
    await prisma.product.update({
      where: { id: laptop.id },
      data: { isActive: true, publishedToStore: true },
    });
  }

  await prisma.purchasePrice.upsert({
    where: { id: `realistic-pp-${laptop.id}` },
    update: { price: new Prisma.Decimal(50000) },
    create: {
      id: `realistic-pp-${laptop.id}`,
      productId: laptop.id,
      price: new Prisma.Decimal(50000),
      currency: "RUB",
      isActive: true,
    },
  });
  await prisma.salePrice.upsert({
    where: { id: `realistic-sp-${laptop.id}` },
    update: { price: new Prisma.Decimal(65000) },
    create: {
      id: `realistic-sp-${laptop.id}`,
      productId: laptop.id,
      priceListId: null,
      price: new Prisma.Decimal(65000),
      currency: "RUB",
      isActive: true,
    },
  });

  // ── Mouse ────────────────────────────────────────────────────────────────
  let mouse = await prisma.product.findFirst({ where: { tenantId, sku: "MS-001" } });
  if (!mouse) {
    mouse = await prisma.product.create({
      data: {
        tenantId,
        name: "Мышь Logitech MX Master 3",
        sku: "MS-001",
        unitId: unitSht.id,
        categoryId: catElectronics.id,
        isActive: true,
        publishedToStore: true,
      },
    });
  } else {
    await prisma.product.update({
      where: { id: mouse.id },
      data: { isActive: true, publishedToStore: true },
    });
  }

  await prisma.purchasePrice.upsert({
    where: { id: `realistic-pp-${mouse.id}` },
    update: { price: new Prisma.Decimal(1500) },
    create: {
      id: `realistic-pp-${mouse.id}`,
      productId: mouse.id,
      price: new Prisma.Decimal(1500),
      currency: "RUB",
      isActive: true,
    },
  });
  await prisma.salePrice.upsert({
    where: { id: `realistic-sp-${mouse.id}` },
    update: { price: new Prisma.Decimal(2200) },
    create: {
      id: `realistic-sp-${mouse.id}`,
      productId: mouse.id,
      priceListId: null,
      price: new Prisma.Decimal(2200),
      currency: "RUB",
      isActive: true,
    },
  });

  console.log("  ✓ Laptop NB-001 + Mouse MS-001 with prices");
  return { laptop, mouse };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2c — Counterparties + Party links
// ─────────────────────────────────────────────────────────────────────────────
async function seedCounterparties(tenantId: string) {
  console.log("\n[2c] Counterparties...");

  async function ensureParty(counterpartyId: string, name: string, type: "person" | "organization") {
    const existing = await prisma.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: counterpartyId } },
    });
    if (existing) return;

    const existingParty = await prisma.party.findUnique({ where: { primaryCounterpartyId: counterpartyId } });
    if (existingParty) {
      await prisma.partyLink.upsert({
        where: { entityType_entityId: { entityType: "counterparty", entityId: counterpartyId } },
        update: {},
        create: { partyId: existingParty.id, entityType: "counterparty", entityId: counterpartyId, isPrimary: true },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const p = await tx.party.create({
        data: { displayName: name, type, primaryCounterpartyId: counterpartyId },
      });
      await tx.partyLink.create({
        data: { partyId: p.id, entityType: "counterparty", entityId: counterpartyId, isPrimary: true },
      });
    });
  }

  // Supplier
  let supplier = await prisma.counterparty.findFirst({ where: { tenantId, name: "ООО РеалПоставщик" } });
  if (!supplier) {
    supplier = await prisma.counterparty.create({
      data: {
        tenantId,
        type: "supplier",
        name: "ООО РеалПоставщик",
        legalName: "ООО РеалПоставщик",
        inn: "REAL-SUP-001",
        isActive: true,
      },
    });
  }
  await ensureParty(supplier.id, supplier.name, "organization");

  // Customer
  let customer = await prisma.counterparty.findFirst({ where: { tenantId, name: "ООО РеалПокупатель" } });
  if (!customer) {
    customer = await prisma.counterparty.create({
      data: {
        tenantId,
        type: "customer",
        name: "ООО РеалПокупатель",
        legalName: "ООО РеалПокупатель",
        inn: "REAL-CUST-001",
        isActive: true,
      },
    });
  }
  await ensureParty(customer.id, customer.name, "organization");

  console.log(`  ✓ Supplier «${supplier.name}» + Customer «${customer.name}» + Party links`);
  return { supplier, customer };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Business chain
// ─────────────────────────────────────────────────────────────────────────────
async function seedBusinessChain(
  tenantId: string,
  products: { laptop: { id: string; name: string }; mouse: { id: string; name: string } },
  warehouse: { id: string },
  counterparties: { supplier: { id: string }; customer: { id: string } }
) {
  console.log("\n[3] Business chain...");

  const { confirmDocumentTransactional } = await import(
    "../lib/modules/accounting/services/document-confirm.service"
  );
  const { generateDocumentNumber } = await import("../lib/modules/accounting/documents");
  const { autoPostPayment }         = await import("../lib/modules/accounting/finance/journal");

  const { laptop, mouse } = products;
  const { supplier, customer } = counterparties;
  const warehouseId = warehouse.id;

  // ── Helper: create document with items ────────────────────────────────────
  async function createDoc(
    descKey: string,
    type: import("../lib/generated/prisma/client").DocumentType,
    data: {
      warehouseId?: string;
      targetWarehouseId?: string;
      counterpartyId?: string;
      paymentType?: "bank_transfer" | "cash" | "card";
    },
    items: Array<{ productId: string; quantity: number; price: number }>
  ) {
    const existing = await prisma.document.findFirst({
      where: { tenantId, type, description: descKey },
    });
    if (existing) {
      console.log(`  ↷ ${type} (${descKey}) already exists`);
      return existing;
    }
    const number = await generateDocumentNumber(type);
    const totalAmount = items.reduce((s, i) => s + i.quantity * i.price, 0);
    return prisma.document.create({
      data: {
        number,
        type,
        status: "draft",
        tenantId,
        warehouseId: data.warehouseId ?? null,
        targetWarehouseId: data.targetWarehouseId ?? null,
        counterpartyId: data.counterpartyId ?? null,
        totalAmount: new Prisma.Decimal(totalAmount),
        date: new Date(),
        description: descKey,
        paymentType: data.paymentType ?? null,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: new Prisma.Decimal(i.price),
            total: new Prisma.Decimal(i.quantity * i.price),
          })),
        },
      },
    });
  }

  async function confirmDoc(doc: { id: string; status: string; type: string }, label: string) {
    const fresh = await prisma.document.findUnique({ where: { id: doc.id }, select: { status: true } });
    if (fresh?.status === "confirmed") {
      console.log(`  ↷ ${label} already confirmed`);
      return;
    }
    await confirmDocumentTransactional(doc.id, "seed-realistic");
    console.log(`  ✓ Confirmed: ${label}`);
  }

  // ── Step 3.1: purchase_order ───────────────────────────────────────────────
  const po = await createDoc(
    "realistic:purchase-order-1",
    "purchase_order",
    { counterpartyId: supplier.id, paymentType: "bank_transfer" },
    [
      { productId: laptop.id, quantity: 5, price: 50000 },
      { productId: mouse.id,  quantity: 10, price: 1500  },
    ]
  );
  await confirmDoc(po, "purchase_order #1");

  // ── Step 3.2: incoming_shipment ────────────────────────────────────────────
  const inShip = await createDoc(
    "realistic:incoming-shipment-1",
    "incoming_shipment",
    { warehouseId, counterpartyId: supplier.id, paymentType: "bank_transfer" },
    [
      { productId: laptop.id, quantity: 5, price: 50000 },
      { productId: mouse.id,  quantity: 10, price: 1500  },
    ]
  );
  await confirmDoc(inShip, "incoming_shipment #1");

  // ── Step 3.3: outgoing_payment (expense) ──────────────────────────────────
  const expenseCat = await prisma.financeCategory.findFirstOrThrow({
    where: { name: "Оплата поставщику", type: "expense", isActive: true },
  });

  const existingPayOut = await prisma.payment.findFirst({
    where: { tenantId, description: "realistic:payment-out-1" },
  });
  let payOut: { id: string; number: string };
  if (existingPayOut) {
    payOut = existingPayOut;
    console.log("  ↷ outgoing_payment already exists");
  } else {
    const counter = await prisma.paymentCounter.update({
      where: { prefix: "PAY" },
      data: { lastNumber: { increment: 1 } },
    });
    const payNumber = `PAY-${String(counter.lastNumber).padStart(6, "0")}`;
    payOut = await prisma.payment.create({
      data: {
        number: payNumber,
        type: "expense",
        categoryId: expenseCat.id,
        counterpartyId: supplier.id,
        amount: new Prisma.Decimal(265000),
        paymentMethod: "bank_transfer",
        date: new Date(),
        description: "realistic:payment-out-1",
        tenantId,
      },
    });
    console.log(`  ✓ Payment out ${payNumber} created (265,000)`);
  }

  // Auto-post payment to journal (idempotent)
  const existingJE = await prisma.journalEntry.findFirst({
    where: { sourceId: payOut.id, sourceType: "finance_payment", isReversed: false },
  });
  if (!existingJE) {
    try {
      await autoPostPayment(payOut.id);
      console.log("  ✓ Payment out posted to journal");
    } catch (e: any) {
      console.warn(`  ⚠ autoPostPayment: ${e.message}`);
    }
  } else {
    console.log("  ↷ Payment out already posted");
  }

  // ── Step 3.4: sales_order ─────────────────────────────────────────────────
  const so = await createDoc(
    "realistic:sales-order-1",
    "sales_order",
    { warehouseId, counterpartyId: customer.id, paymentType: "bank_transfer" },
    [
      { productId: laptop.id, quantity: 3, price: 65000 },
      { productId: mouse.id,  quantity: 5, price: 2200  },
    ]
  );
  await confirmDoc(so, "sales_order #1");

  // ── Step 3.5: outgoing_shipment ────────────────────────────────────────────
  const outShip = await createDoc(
    "realistic:outgoing-shipment-1",
    "outgoing_shipment",
    { warehouseId, counterpartyId: customer.id, paymentType: "bank_transfer" },
    [
      { productId: laptop.id, quantity: 3, price: 65000 },
      { productId: mouse.id,  quantity: 5, price: 2200  },
    ]
  );
  await confirmDoc(outShip, "outgoing_shipment #1");

  // ── Step 3.6: incoming_payment (income) ───────────────────────────────────
  const incomeCat = await prisma.financeCategory.findFirstOrThrow({
    where: { name: "Оплата от покупателя", type: "income", isActive: true },
  });

  const existingPayIn = await prisma.payment.findFirst({
    where: { tenantId, description: "realistic:payment-in-1" },
  });
  let payIn: { id: string; number: string };
  if (existingPayIn) {
    payIn = existingPayIn;
    console.log("  ↷ incoming_payment already exists");
  } else {
    const counter = await prisma.paymentCounter.update({
      where: { prefix: "PAY" },
      data: { lastNumber: { increment: 1 } },
    });
    const payNumber = `PAY-${String(counter.lastNumber).padStart(6, "0")}`;
    payIn = await prisma.payment.create({
      data: {
        number: payNumber,
        type: "income",
        categoryId: incomeCat.id,
        counterpartyId: customer.id,
        amount: new Prisma.Decimal(206000),
        paymentMethod: "bank_transfer",
        date: new Date(),
        description: "realistic:payment-in-1",
        tenantId,
      },
    });
    console.log(`  ✓ Payment in ${payNumber} created (206,000)`);
  }

  const existingJEIn = await prisma.journalEntry.findFirst({
    where: { sourceId: payIn.id, sourceType: "finance_payment", isReversed: false },
  });
  if (!existingJEIn) {
    try {
      await autoPostPayment(payIn.id);
      console.log("  ✓ Payment in posted to journal");
    } catch (e: any) {
      console.warn(`  ⚠ autoPostPayment (in): ${e.message}`);
    }
  } else {
    console.log("  ↷ Payment in already posted");
  }

  console.log("  ✓ Business chain complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Process outbox
// ─────────────────────────────────────────────────────────────────────────────
async function processOutboxFull(): Promise<void> {
  console.log("\n[4] Processing outbox...");

  const { processOutboxEvents, registerOutboxHandler } = await import("../lib/events/outbox");
  const { onDocumentConfirmedBalance } = await import("../lib/modules/accounting/handlers/balance-handler");
  const { onDocumentConfirmedJournal } = await import("../lib/modules/accounting/handlers/journal-handler");
  const { onDocumentConfirmedPayment } = await import("../lib/modules/accounting/handlers/payment-handler");
  const { onProductCatalogUpdated }    = await import("../lib/modules/ecommerce/handlers");

  registerOutboxHandler("DocumentConfirmed",   onDocumentConfirmedBalance as any);
  registerOutboxHandler("DocumentConfirmed",   onDocumentConfirmedJournal as any);
  registerOutboxHandler("DocumentConfirmed",   onDocumentConfirmedPayment as any);
  registerOutboxHandler("product.updated",     onProductCatalogUpdated as any);
  registerOutboxHandler("sale_price.updated",  onProductCatalogUpdated as any);
  registerOutboxHandler("discount.updated",    onProductCatalogUpdated as any);

  let totalProcessed = 0;
  let totalFailed    = 0;
  let batchNum       = 0;

  while (true) {
    const result = await processOutboxEvents(20);
    totalProcessed += result.processed;
    totalFailed    += result.failed;
    batchNum++;

    if (result.claimed === 0) break;
    if (batchNum > 20) { console.warn("  ⚠ Too many batches"); break; }
    for (const err of result.errors) {
      console.warn(`  ⚠ Outbox event ${err.eventId}: ${err.error}`);
    }
  }

  console.log(`  ✓ Outbox: ${totalProcessed} ok, ${totalFailed} failed (${batchNum} batches)`);

  // Re-post confirmed documents that have no journal entry (handles re-runs)
  console.log("  → Re-posting documents without journal entries...");
  const { autoPostDocument } = await import("../lib/modules/accounting/finance/journal");
  const tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "default" } })).id;
  const confirmedDocs = await prisma.document.findMany({
    where: { tenantId, status: "confirmed" },
    select: { id: true, number: true, date: true },
  });

  let reposted = 0;
  for (const doc of confirmedDocs) {
    try {
      await autoPostDocument(doc.id, doc.number, doc.date, "seed-realistic");
      reposted++;
    } catch (e: any) {
      // autoPostDocument is idempotent — "already posted" is not an error
    }
  }
  if (reposted > 0) console.log(`  ✓ Re-posted ${reposted} docs`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — E-commerce order
// ─────────────────────────────────────────────────────────────────────────────
async function seedEcommerceOrder(
  products: { mouse: { id: string } }
): Promise<void> {
  console.log("\n[5] E-commerce order...");

  // Ensure OrderCounter
  await prisma.orderCounter.upsert({
    where: { prefix: "ORD" },
    update: {},
    create: { prefix: "ORD", lastNumber: 0 },
  });

  // Upsert customer
  const ecomCustomer = await prisma.customer.upsert({
    where: { telegramId: "999001" },
    create: {
      telegramId: "999001",
      name: "Тест Покупатель",
      telegramUsername: "test_realistic_buyer",
      isActive: true,
    },
    update: {},
  });

  // Create Party + PartyLink for customer
  const existingLink = await prisma.partyLink.findUnique({
    where: { entityType_entityId: { entityType: "customer", entityId: ecomCustomer.id } },
  });
  if (!existingLink) {
    const existingParty = await prisma.party.findUnique({ where: { primaryCustomerId: ecomCustomer.id } });
    if (!existingParty) {
      await prisma.$transaction(async (tx) => {
        const p = await tx.party.create({
          data: { displayName: ecomCustomer.name ?? "Тест Покупатель", type: "person", primaryCustomerId: ecomCustomer.id },
        });
        await tx.partyLink.create({
          data: { partyId: p.id, entityType: "customer", entityId: ecomCustomer.id, isPrimary: true },
        });
      });
    }
  }

  // Idempotent order creation
  const orderNum = "ORD-REALISTIC-001";
  const existingOrder = await prisma.order.findUnique({ where: { orderNumber: orderNum } });
  if (!existingOrder) {
    const salePrice = await prisma.salePrice.findFirst({
      where: { productId: products.mouse.id, isActive: true, priceListId: null },
    });
    const mousePrice = toNum(salePrice?.price) || 2200;

    await prisma.order.create({
      data: {
        orderNumber: orderNum,
        customerId: ecomCustomer.id,
        status: "delivered",
        deliveryType: "pickup",
        totalAmount: new Prisma.Decimal(mousePrice * 2),
        paymentMethod: "cash",
        paymentStatus: "paid",
        items: {
          create: [
            {
              productId: products.mouse.id,
              quantity: 2,
              price: new Prisma.Decimal(mousePrice),
              total: new Prisma.Decimal(mousePrice * 2),
            },
          ],
        },
      },
    });
    console.log(`  ✓ Order ${orderNum} created (2 × Mouse = ${mousePrice * 2})`);
  } else {
    console.log(`  ↷ Order ${orderNum} already exists`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Party activities
// ─────────────────────────────────────────────────────────────────────────────
async function seedPartyActivities(
  counterparties: { supplier: { id: string }; customer: { id: string } }
): Promise<void> {
  console.log("\n[6] Party activities...");

  const activityDefs = [
    { counterpartyId: counterparties.supplier.id, type: "call",    sourceId: "realistic-act-sup-call",    summary: { note: "Закупка товаров, 265,000 руб" } },
    { counterpartyId: counterparties.customer.id, type: "meeting", sourceId: "realistic-act-cust-meeting", summary: { note: "Продажа товаров, 206,000 руб" } },
  ];

  for (const def of activityDefs) {
    const link = await prisma.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: def.counterpartyId } },
    });
    if (!link) continue;

    const existing = await prisma.partyActivity.findUnique({
      where: { sourceType_sourceId_type: { sourceType: "seed-realistic", sourceId: def.sourceId, type: def.type } },
    });
    if (!existing) {
      await prisma.partyActivity.create({
        data: {
          partyId: link.partyId,
          type: def.type,
          occurredAt: new Date(),
          sourceType: "seed-realistic",
          sourceId: def.sourceId,
          summary: def.summary,
        },
      });
      console.log(`  ✓ PartyActivity: ${def.type} for counterparty ${def.counterpartyId}`);
    } else {
      console.log(`  ↷ PartyActivity ${def.type} already exists`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Rebuild ProductCatalogProjection
// ─────────────────────────────────────────────────────────────────────────────
async function rebuildProjections(
  products: { laptop: { id: string }; mouse: { id: string } }
): Promise<void> {
  console.log("\n[7] Rebuilding ProductCatalogProjection...");

  const { updateProductCatalogProjection } = await import(
    "../lib/modules/ecommerce/projections/product-catalog.projection"
  );

  for (const product of [products.laptop, products.mouse]) {
    await updateProductCatalogProjection(product.id);
    console.log(`  ✓ Projection rebuilt for product ${product.id}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Verifications
// ─────────────────────────────────────────────────────────────────────────────
async function runVerifications(
  tenantId: string,
  products: { laptop: { id: string }; mouse: { id: string } },
  warehouse: { id: string }
): Promise<void> {
  console.log("\n=== VERIFICATION RESULTS ===\n");

  // Check 1: Stock conservation
  console.log("Check 1: Stock conservation (movements sum = StockRecord.quantity)");
  try {
    const movements = await prisma.stockMovement.groupBy({
      by: ["productId", "warehouseId"],
      _sum: { quantity: true },
      where: { warehouseId: warehouse.id },
    });

    let ok = 0, mismatch = 0;
    for (const m of movements) {
      const record = await prisma.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: m.warehouseId, productId: m.productId } },
      });
      const movSum = m._sum.quantity ?? 0;
      const recQty = record?.quantity ?? 0;
      if (Math.abs(movSum - recQty) < 0.001) {
        ok++;
      } else {
        mismatch++;
        console.warn(`  ⚠ Mismatch productId=${m.productId}: movements=${movSum} record=${recQty}`);
      }
    }
    console.log(`  ${mismatch === 0 ? "✓ PASS" : "✗ FAIL"}: ${ok} pairs match, ${mismatch} mismatch`);

    // Specific checks
    const laptopStock = await prisma.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: products.laptop.id } },
    });
    const mouseStock = await prisma.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: products.mouse.id } },
    });
    console.log(`  Laptop stock: ${laptopStock?.quantity ?? 0} (expected: 2)`);
    console.log(`  Mouse stock:  ${mouseStock?.quantity ?? 0} (expected: 5)`);
    console.log(`  Laptop AVCO:  ${toNum(laptopStock?.averageCost)} (expected: 50000)`);
    console.log(`  Mouse AVCO:   ${toNum(mouseStock?.averageCost)} (expected: 1500)`);
  } catch (e: any) {
    console.error(`  ✗ Check 1 error: ${e.message}`);
  }

  // Check 2: Double-entry
  console.log("\nCheck 2: Double-entry (SUM debit = SUM credit)");
  try {
    const agg = await prisma.ledgerLine.aggregate({ _sum: { debit: true, credit: true } });
    const totalDebit  = toNum(agg._sum.debit);
    const totalCredit = toNum(agg._sum.credit);
    const diff = Math.abs(totalDebit - totalCredit);
    const pass = diff < 0.01 && totalDebit > 0;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: debit=${totalDebit.toFixed(2)}, credit=${totalCredit.toFixed(2)}, diff=${diff.toFixed(4)}`);
  } catch (e: any) {
    console.error(`  ✗ Check 2 error: ${e.message}`);
  }

  // Check 3: Projection coverage
  console.log("\nCheck 3: ProductCatalogProjection coverage");
  try {
    const productCount = await prisma.product.count({ where: { tenantId, isActive: true, publishedToStore: true } });
    const projCount    = await prisma.productCatalogProjection.count({ where: { tenantId, isActive: true, publishedToStore: true } });
    const pass = productCount === projCount && productCount > 0;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: active+published products=${productCount}, projections=${projCount}`);
  } catch (e: any) {
    console.error(`  ✗ Check 3 error: ${e.message}`);
  }

  // Check 4: Party coverage
  console.log("\nCheck 4: Party coverage for counterparties");
  try {
    const allCps = await prisma.counterparty.findMany({ where: { tenantId }, select: { id: true } });
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

  // Summary
  console.log("\n── Summary ──────────────────────────────────────────");
  const docTotal  = await prisma.document.count({ where: { tenantId } });
  const docConf   = await prisma.document.count({ where: { tenantId, status: "confirmed" } });
  const stockMov  = await prisma.stockMovement.count();
  const stockRec  = await prisma.stockRecord.count();
  const ledger    = await prisma.ledgerLine.count();
  const parties   = await prisma.party.count();
  const orders    = await prisma.order.count();
  const projCount = await prisma.productCatalogProjection.count({ where: { tenantId } });

  console.log(`  Tenant:         ${tenantId}`);
  console.log(`  Documents:      ${docTotal} total (${docConf} confirmed)`);
  console.log(`  StockMovements: ${stockMov}`);
  console.log(`  StockRecords:   ${stockRec}`);
  console.log(`  LedgerLines:    ${ledger}`);
  console.log(`  Parties:        ${parties}`);
  console.log(`  Orders:         ${orders}`);
  console.log(`  Projections:    ${projCount}`);
  console.log("\n=== END VERIFICATION ===\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== seed-realistic.ts starting ===");

  // 0. Clean up test tenant
  await cleanupTestTenant();

  // Find default tenant
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "default" }, { id: "default-tenant" }] },
  });
  if (!tenant) throw new Error("Default tenant not found — run prisma/seed.ts first");
  console.log(`\nDefault tenant: ${tenant.id} (${tenant.name})`);

  // 1. Chart of accounts
  await seedChartOfAccounts(tenant.id);

  // 2. Warehouse + Products + Counterparties
  const warehouse      = await seedWarehouse(tenant.id);
  const products       = await seedProducts(tenant.id);
  const counterparties = await seedCounterparties(tenant.id);

  // 3. Business chain
  await seedBusinessChain(tenant.id, products, warehouse, counterparties);

  // 4. Process outbox
  await processOutboxFull();

  // 5. E-commerce
  await seedEcommerceOrder(products);

  // 6. Party activities
  await seedPartyActivities(counterparties);

  // 7. Projections
  await rebuildProjections(products);

  // 8. Verify
  await runVerifications(tenant.id, products, warehouse);

  console.log("=== seed-realistic.ts complete ===");
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

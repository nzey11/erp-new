/**
 * Stock demo seed — Wave 3 manual gate B verification data.
 *
 * Creates:
 * - 2 product categories
 * - 2 warehouses (linked to default tenant)
 * - 10 products with SKUs, purchase prices, sale prices
 * - StockRecord entries (realistic quantities + costs)
 * - 3 stock documents (stock_receipt x2, write_off x1) for legacy tab testing
 * - 2 suppliers (counterparties)
 *
 * Safe to run multiple times — uses upsert everywhere.
 */

import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_ID = "default-tenant";

async function main() {
  console.log("Seeding stock demo data...");

  // ── Units (already seeded, just fetch) ──────────────────────────────────────
  const unitSht = await prisma.unit.findUniqueOrThrow({ where: { shortName: "шт" } });
  const unitKg  = await prisma.unit.findUniqueOrThrow({ where: { shortName: "кг" } });
  const unitUp  = await prisma.unit.findUniqueOrThrow({ where: { shortName: "уп" } });

  // ── Warehouses ───────────────────────────────────────────────────────────────
  const wh1 = await prisma.warehouse.upsert({
    where: { id: "demo-warehouse-main" },
    update: { name: "Основной склад", isActive: true },
    create: {
      id: "demo-warehouse-main",
      tenantId: TENANT_ID,
      name: "Основной склад",
      address: "г. Москва, ул. Складская, 1",
      responsibleName: "Иванов И.И.",
      isActive: true,
    },
  });

  const wh2 = await prisma.warehouse.upsert({
    where: { id: "demo-warehouse-retail" },
    update: { name: "Торговая точка", isActive: true },
    create: {
      id: "demo-warehouse-retail",
      tenantId: TENANT_ID,
      name: "Торговая точка",
      address: "г. Москва, ТЦ Центральный, павильон 42",
      responsibleName: "Петрова А.В.",
      isActive: true,
    },
  });
  console.log("  ✓ 2 warehouses");

  // ── Suppliers ────────────────────────────────────────────────────────────────
  const supplier1 = await prisma.counterparty.upsert({
    where: { inn: "7701234567" },
    update: {},
    create: {
      tenantId: TENANT_ID,
      type: "supplier",
      name: "ООО «ТехноПоставка»",
      legalName: "ООО «ТехноПоставка»",
      inn: "7701234567",
      isActive: true,
    },
  });

  const supplier2 = await prisma.counterparty.upsert({
    where: { inn: "7709876543" },
    update: {},
    create: {
      tenantId: TENANT_ID,
      type: "supplier",
      name: "ИП Сидоров В.П.",
      inn: "7709876543",
      isActive: true,
    },
  });
  console.log("  ✓ 2 suppliers");

  // ── Product categories ───────────────────────────────────────────────────────
  const catElectronics = await prisma.productCategory.upsert({
    where: { id: "demo-cat-electronics" },
    update: { name: "Электроника" },
    create: { id: "demo-cat-electronics", name: "Электроника", order: 1, isActive: true },
  });

  const catFood = await prisma.productCategory.upsert({
    where: { id: "demo-cat-food" },
    update: { name: "Продукты питания" },
    create: { id: "demo-cat-food", name: "Продукты питания", order: 2, isActive: true },
  });
  console.log("  ✓ 2 categories");

  // ── Products ─────────────────────────────────────────────────────────────────
  const products = [
    // Electronics
    { id: "demo-prod-01", name: "Смартфон Redmi Note 12", sku: "PHONE-001", unitId: unitSht.id, categoryId: catElectronics.id, purchasePrice: 8500, salePrice: 12990 },
    { id: "demo-prod-02", name: "Наушники JBL Tune 510BT", sku: "HEAD-001", unitId: unitSht.id, categoryId: catElectronics.id, purchasePrice: 1800, salePrice: 2990 },
    { id: "demo-prod-03", name: "Зарядное устройство 65W", sku: "CHRG-001", unitId: unitSht.id, categoryId: catElectronics.id, purchasePrice: 450, salePrice: 790 },
    { id: "demo-prod-04", name: "USB-C кабель 2м", sku: "CABL-001", unitId: unitSht.id, categoryId: catElectronics.id, purchasePrice: 120, salePrice: 250 },
    { id: "demo-prod-05", name: "Повербанк 20000 mAh", sku: "BANK-001", unitId: unitSht.id, categoryId: catElectronics.id, purchasePrice: 1200, salePrice: 1990 },
    // Food
    { id: "demo-prod-06", name: "Кофе молотый Арабика 250г", sku: "COFE-001", unitId: unitUp.id, categoryId: catFood.id, purchasePrice: 320, salePrice: 490 },
    { id: "demo-prod-07", name: "Чай чёрный 100 пак.", sku: "TEAB-001", unitId: unitUp.id, categoryId: catFood.id, purchasePrice: 180, salePrice: 290 },
    { id: "demo-prod-08", name: "Сахар белый 1кг", sku: "SUGR-001", unitId: unitKg.id, categoryId: catFood.id, purchasePrice: 60, salePrice: 89 },
    { id: "demo-prod-09", name: "Вода питьевая 5л", sku: "WATR-001", unitId: unitUp.id, categoryId: catFood.id, purchasePrice: 75, salePrice: 120 },
    { id: "demo-prod-10", name: "Батончик шоколадный ассорти", sku: "CHOC-001", unitId: unitSht.id, categoryId: catFood.id, purchasePrice: 45, salePrice: 79 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { name: p.name },
      create: {
        id: p.id,
        tenantId: TENANT_ID,
        name: p.name,
        sku: p.sku,
        unitId: p.unitId,
        categoryId: p.categoryId,
        isActive: true,
        publishedToStore: false,
      },
    });

    // Purchase price
    await prisma.purchasePrice.upsert({
      where: { id: `pp-${p.id}` },
      update: { price: p.purchasePrice },
      create: {
        id: `pp-${p.id}`,
        productId: p.id,
        price: p.purchasePrice,
        currency: "RUB",
        isActive: true,
      },
    });

    // Sale price (default price list — priceListId: null)
    await prisma.salePrice.upsert({
      where: { id: `sp-${p.id}` },
      update: { price: p.salePrice },
      create: {
        id: `sp-${p.id}`,
        productId: p.id,
        priceListId: null,
        price: p.salePrice,
        currency: "RUB",
        isActive: true,
      },
    });
  }
  console.log(`  ✓ ${products.length} products with prices`);

  // ── StockRecords — realistic balances ────────────────────────────────────────
  // Format: [productId, warehouseId, quantity, averageCost]
  const stockRecords: [string, string, number, number][] = [
    // Main warehouse — most products in stock
    ["demo-prod-01", wh1.id, 25,   8500],
    ["demo-prod-02", wh1.id, 42,   1800],
    ["demo-prod-03", wh1.id, 87,   450],
    ["demo-prod-04", wh1.id, 150,  120],
    ["demo-prod-05", wh1.id, 33,   1200],
    ["demo-prod-06", wh1.id, 60,   320],
    ["demo-prod-07", wh1.id, 95,   180],
    ["demo-prod-08", wh1.id, 200,  60],
    ["demo-prod-09", wh1.id, 48,   75],
    ["demo-prod-10", wh1.id, 300,  45],
    // Retail warehouse — smaller quantities
    ["demo-prod-01", wh2.id, 5,    8500],
    ["demo-prod-02", wh2.id, 8,    1800],
    ["demo-prod-03", wh2.id, 15,   450],
    ["demo-prod-06", wh2.id, 12,   320],
    ["demo-prod-07", wh2.id, 20,   180],
    ["demo-prod-10", wh2.id, 50,   45],
  ];

  for (const [productId, warehouseId, quantity, averageCost] of stockRecords) {
    const totalCostValue = quantity * averageCost;
    await prisma.stockRecord.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: { quantity, averageCost, totalCostValue },
      create: { warehouseId, productId, quantity, averageCost, totalCostValue },
    });
  }
  console.log(`  ✓ ${stockRecords.length} stock records`);

  // ── Stock documents — for legacy tabs testing ─────────────────────────────
  // stock_receipt document (confirmed) — for Оприходования tab
  const docReceipt1 = await prisma.document.upsert({
    where: { number: "ОП-0001" },
    update: {},
    create: {
      number: "ОП-0001",
      type: "stock_receipt",
      status: "confirmed",
      tenantId: TENANT_ID,
      warehouseId: wh1.id,
      counterpartyId: supplier1.id,
      totalAmount: 42500,
      date: new Date("2026-02-10"),
    },
  });

  // @ts-ignore - unused variable kept for seed consistency
  const _docReceipt2 = await prisma.document.upsert({
    where: { number: "ОП-0002" },
    update: {},
    create: {
      number: "ОП-0002",
      type: "stock_receipt",
      status: "draft",
      tenantId: TENANT_ID,
      warehouseId: wh2.id,
      counterpartyId: supplier2.id,
      totalAmount: 8100,
      date: new Date("2026-03-01"),
    },
  });

  // write_off document (draft) — for Списания tab
  const docWriteOff = await prisma.document.upsert({
    where: { number: "СП-0001" },
    update: {},
    create: {
      number: "СП-0001",
      type: "write_off",
      status: "draft",
      tenantId: TENANT_ID,
      warehouseId: wh1.id,
      totalAmount: 4500,
      date: new Date("2026-03-05"),
    },
  });

  // inventory_count document (draft) — for Инвентаризации tab
  await prisma.document.upsert({
    where: { number: "ИН-0001" },
    update: {},
    create: {
      number: "ИН-0001",
      type: "inventory_count",
      status: "draft",
      tenantId: TENANT_ID,
      warehouseId: wh1.id,
      totalAmount: 0,
      date: new Date("2026-03-10"),
    },
  });

  // Add items to receipt 1
  const receiptItems = [
    { productId: "demo-prod-01", quantity: 5,  price: 8500,  total: 42500 },
  ];
  for (const item of receiptItems) {
    await prisma.documentItem.upsert({
      where: { id: `di-${docReceipt1.id}-${item.productId}` },
      update: {},
      create: {
        id: `di-${docReceipt1.id}-${item.productId}`,
        documentId: docReceipt1.id,
        ...item,
      },
    });
  }

  // Add items to write_off
  await prisma.documentItem.upsert({
    where: { id: `di-${docWriteOff.id}-demo-prod-10` },
    update: {},
    create: {
      id: `di-${docWriteOff.id}-demo-prod-10`,
      documentId: docWriteOff.id,
      productId: "demo-prod-10",
      quantity: 100,
      price: 45,
      total: 4500,
    },
  });

  console.log("  ✓ 4 stock documents (stock_receipt x2, write_off x1, inventory_count x1)");
  console.log("\nStock demo seed completed!");
  console.log("\nWhat was seeded:");
  console.log("  Warehouses: «Основной склад», «Торговая точка»");
  console.log("  Products: 10 items (5 electronics, 5 food)");
  console.log("  Stock records: 16 records across 2 warehouses");
  console.log("  Documents: ОП-0001 (confirmed), ОП-0002 (draft), СП-0001 (draft), ИН-0001 (draft)");
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

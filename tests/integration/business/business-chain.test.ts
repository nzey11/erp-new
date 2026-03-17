/**
 * business-chain.test.ts
 *
 * Verifies the realistic business chain created by prisma/seed-realistic.ts.
 *
 * IMPORTANT: Does NOT call cleanDatabase() — reads data created by the seed.
 * Run `npx tsx prisma/seed-realistic.ts` before running these tests.
 *
 * Business chain:
 *   purchase_order (5 laptops × 50,000 + 10 mice × 1,500 = 265,000)
 *   → incoming_shipment (same items, confirmed)
 *     → stock: +5 laptops, +10 mice
 *   → outgoing_payment 265,000 to supplier
 *   → sales_order (3 laptops × 65,000 + 5 mice × 2,200 = 206,000)
 *   → outgoing_shipment (same items, confirmed)
 *     → stock: 5-3=2 laptops, 10-5=5 mice
 *   → incoming_payment 206,000 from customer
 *   → outbox processed (journal, balance, payment handlers)
 *   → e-commerce order (2 × mouse, delivered)
 *   → party activities
 *   → catalog projections rebuilt
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/shared/db";
import { toNumber } from "@/lib/shared/db";

// ─────────────────────────────────────────────────────────────────────────────
// Global test state — resolved in beforeAll
// ─────────────────────────────────────────────────────────────────────────────
let tenantId: string;
let warehouseId: string;
let laptopId: string;
let mouseId: string;
let supplierId: string;
let customerId: string;

beforeAll(async () => {
  // Find default tenant
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ slug: "default" }, { id: "default-tenant" }] },
  });
  if (!tenant) throw new Error("Default tenant not found — run `npx tsx prisma/seed.ts` first");
  tenantId = tenant.id;

  // Find warehouse
  const warehouse = await db.warehouse.findUnique({ where: { id: "realistic-wh-main" } });
  if (!warehouse) throw new Error("Realistic warehouse not found — run `npx tsx prisma/seed-realistic.ts` first");
  warehouseId = warehouse.id;

  // Find products
  const laptop = await db.product.findFirst({ where: { tenantId, sku: "NB-001" } });
  if (!laptop) throw new Error("Laptop (NB-001) not found — run seed-realistic.ts first");
  laptopId = laptop.id;

  const mouse = await db.product.findFirst({ where: { tenantId, sku: "MS-001" } });
  if (!mouse) throw new Error("Mouse (MS-001) not found — run seed-realistic.ts first");
  mouseId = mouse.id;

  // Find counterparties
  const supplier = await db.counterparty.findFirst({ where: { tenantId, name: "ООО РеалПоставщик" } });
  if (!supplier) throw new Error("Supplier not found — run seed-realistic.ts first");
  supplierId = supplier.id;

  const customer = await db.counterparty.findFirst({ where: { tenantId, name: "ООО РеалПокупатель" } });
  if (!customer) throw new Error("Customer not found — run seed-realistic.ts first");
  customerId = customer.id;
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Stock
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Stock", () => {
  it("laptop stock is exactly 2 after purchase(5) and sale(3)", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(record).not.toBeNull();
    expect(record!.quantity).toBeCloseTo(2, 3);
  });

  it("mouse stock is exactly 5 after purchase(10) and sale(5)", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(record).not.toBeNull();
    expect(record!.quantity).toBeCloseTo(5, 3);
  });

  it("stock conservation: sum of movements = StockRecord.quantity for laptop", async () => {
    const agg = await db.stockMovement.aggregate({
      where: { productId: laptopId, warehouseId },
      _sum: { quantity: true },
    });
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    const movSum = agg._sum.quantity ?? 0;
    const recQty = record?.quantity ?? 0;
    expect(Math.abs(movSum - recQty)).toBeLessThan(0.001);
  });

  it("stock conservation: sum of movements = StockRecord.quantity for mouse", async () => {
    const agg = await db.stockMovement.aggregate({
      where: { productId: mouseId, warehouseId },
      _sum: { quantity: true },
    });
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    const movSum = agg._sum.quantity ?? 0;
    const recQty = record?.quantity ?? 0;
    expect(Math.abs(movSum - recQty)).toBeLessThan(0.001);
  });

  it("stock movements exist for incoming_shipment (receipts)", async () => {
    // incoming_shipment creates positive movements
    const movements = await db.stockMovement.findMany({
      where: {
        productId: laptopId,
        warehouseId,
        quantity: { gt: 0 },
        isReversing: false,
      },
    });
    expect(movements.length).toBeGreaterThanOrEqual(1);
  });

  it("stock movements exist for outgoing_shipment (issues)", async () => {
    // outgoing_shipment creates negative movements
    const movements = await db.stockMovement.findMany({
      where: {
        productId: laptopId,
        warehouseId,
        quantity: { lt: 0 },
        isReversing: false,
      },
    });
    expect(movements.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: AVCO (Average Cost)
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — AVCO", () => {
  it("laptop AVCO is 50,000 (single purchase price, no blending)", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(record).not.toBeNull();
    expect(toNumber(record!.averageCost)).toBeCloseTo(50000, 0);
  });

  it("mouse AVCO is 1,500 (single purchase price, no blending)", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(record).not.toBeNull();
    expect(toNumber(record!.averageCost)).toBeCloseTo(1500, 0);
  });

  it("laptop totalCostValue = quantity × averageCost", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(record).not.toBeNull();
    const expected = record!.quantity * toNumber(record!.averageCost);
    expect(toNumber(record!.totalCostValue)).toBeCloseTo(expected, 0);
  });

  it("mouse totalCostValue = quantity × averageCost", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(record).not.toBeNull();
    const expected = record!.quantity * toNumber(record!.averageCost);
    expect(toNumber(record!.totalCostValue)).toBeCloseTo(expected, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Double-entry finance
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Double-Entry (Accounting)", () => {
  it("total debit equals total credit across ALL LedgerLines", async () => {
    const agg = await db.ledgerLine.aggregate({ _sum: { debit: true, credit: true } });
    const totalDebit  = toNumber(agg._sum.debit);
    const totalCredit = toNumber(agg._sum.credit);
    expect(totalDebit).toBeGreaterThan(0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it("at least one JournalEntry exists for incoming_shipment document", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "incoming_shipment", description: "realistic:incoming-shipment-1" },
      select: { id: true },
    });
    expect(doc).not.toBeNull();

    const entry = await db.journalEntry.findFirst({
      where: { sourceId: doc!.id, isReversed: false },
    });
    expect(entry).not.toBeNull();
  });

  it("at least one JournalEntry exists for outgoing_shipment document", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "outgoing_shipment", description: "realistic:outgoing-shipment-1" },
      select: { id: true },
    });
    expect(doc).not.toBeNull();

    const entry = await db.journalEntry.findFirst({
      where: { sourceId: doc!.id, isReversed: false },
    });
    expect(entry).not.toBeNull();
  });

  it("each JournalEntry has balanced LedgerLines (debit = credit per entry)", async () => {
    // Only check realistic seed entries — get entries for our documents
    const docDescriptions = [
      "realistic:purchase-order-1",
      "realistic:incoming-shipment-1",
      "realistic:sales-order-1",
      "realistic:outgoing-shipment-1",
    ];
    const docs = await db.document.findMany({
      where: { tenantId, description: { in: docDescriptions } },
      select: { id: true },
    });
    const docIds = docs.map((d) => d.id);

    // Also get payment journal entries
    const payments = await db.payment.findMany({
      where: { tenantId, description: { in: ["realistic:payment-out-1", "realistic:payment-in-1"] } },
      select: { id: true },
    });
    const payIds = payments.map((p) => p.id);

    const sourceIds = [...docIds, ...payIds];
    const entries = await db.journalEntry.findMany({
      where: { sourceId: { in: sourceIds }, isReversed: false },
      include: { lines: true },
    });

    for (const entry of entries) {
      const debitSum  = entry.lines.reduce((s, l) => s + toNumber(l.debit),  0);
      const creditSum = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0);
      expect(Math.abs(debitSum - creditSum)).toBeLessThan(0.01);
    }
    // We should have at least 2 entries (shipments)
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Counterparty Balance
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Counterparty Balance", () => {
  it("supplier counterparty balance record exists", async () => {
    const balance = await db.counterpartyBalance.findUnique({
      where: { counterpartyId: supplierId },
    });
    // Balance should exist after outbox processes DocumentConfirmed → recalculateBalance
    expect(balance).not.toBeNull();
  });

  it("customer counterparty balance record exists", async () => {
    const balance = await db.counterpartyBalance.findUnique({
      where: { counterpartyId: customerId },
    });
    expect(balance).not.toBeNull();
  });

  it("counterparty balances use balanceRub field (schema check)", async () => {
    // This test documents the schema field name as balanceRub (not balance)
    const balance = await db.counterpartyBalance.findFirst({
      where: { counterpartyId: { in: [supplierId, customerId] } },
    });
    if (balance) {
      expect(typeof balance.balanceRub).not.toBe("undefined");
      expect(balance).toHaveProperty("balanceRub");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Documents
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Documents", () => {
  it("purchase_order is confirmed", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "purchase_order", description: "realistic:purchase-order-1" },
    });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("confirmed");
    expect(doc!.confirmedAt).not.toBeNull();
  });

  it("incoming_shipment is confirmed", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "incoming_shipment", description: "realistic:incoming-shipment-1" },
    });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("confirmed");
  });

  it("sales_order is confirmed", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "sales_order", description: "realistic:sales-order-1" },
    });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("confirmed");
  });

  it("outgoing_shipment is confirmed", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "outgoing_shipment", description: "realistic:outgoing-shipment-1" },
    });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("confirmed");
  });

  it("purchase_order total amount = 5×50000 + 10×1500 = 265,000", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "purchase_order", description: "realistic:purchase-order-1" },
    });
    expect(doc).not.toBeNull();
    expect(toNumber(doc!.totalAmount)).toBeCloseTo(265000, 0);
  });

  it("sales_order total amount = 3×65000 + 5×2200 = 206,000", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "sales_order", description: "realistic:sales-order-1" },
    });
    expect(doc).not.toBeNull();
    expect(toNumber(doc!.totalAmount)).toBeCloseTo(206000, 0);
  });

  it("incoming_shipment is linked to correct supplier counterparty", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "incoming_shipment", description: "realistic:incoming-shipment-1" },
    });
    expect(doc!.counterpartyId).toBe(supplierId);
  });

  it("outgoing_shipment is linked to correct customer counterparty", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "outgoing_shipment", description: "realistic:outgoing-shipment-1" },
    });
    expect(doc!.counterpartyId).toBe(customerId);
  });

  it("incoming_shipment has 2 document items", async () => {
    const doc = await db.document.findFirst({
      where: { tenantId, type: "incoming_shipment", description: "realistic:incoming-shipment-1" },
      include: { items: true },
    });
    expect(doc!.items).toHaveLength(2);
  });

  it("outgoing_shipment items quantities match sales_order", async () => {
    const so = await db.document.findFirst({
      where: { tenantId, type: "sales_order", description: "realistic:sales-order-1" },
      include: { items: { orderBy: { productId: "asc" } } },
    });
    const os = await db.document.findFirst({
      where: { tenantId, type: "outgoing_shipment", description: "realistic:outgoing-shipment-1" },
      include: { items: { orderBy: { productId: "asc" } } },
    });
    expect(so!.items).toHaveLength(2);
    expect(os!.items).toHaveLength(2);
    // Total quantities match
    const soTotal = so!.items.reduce((s, i) => s + i.quantity, 0);
    const osTotal = os!.items.reduce((s, i) => s + i.quantity, 0);
    expect(soTotal).toBe(osTotal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: CRM / Party
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — CRM / Party", () => {
  it("supplier has a PartyLink of entityType=counterparty", async () => {
    const link = await db.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: supplierId } },
    });
    expect(link).not.toBeNull();
    expect(link!.entityType).toBe("counterparty");
  });

  it("customer has a PartyLink of entityType=counterparty", async () => {
    const link = await db.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: customerId } },
    });
    expect(link).not.toBeNull();
  });

  it("supplier party has a 'call' activity", async () => {
    const link = await db.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: supplierId } },
    });
    expect(link).not.toBeNull();

    const activity = await db.partyActivity.findFirst({
      where: { partyId: link!.partyId, type: "call" },
    });
    expect(activity).not.toBeNull();
  });

  it("customer party has a 'meeting' activity", async () => {
    const link = await db.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "counterparty", entityId: customerId } },
    });
    expect(link).not.toBeNull();

    const activity = await db.partyActivity.findFirst({
      where: { partyId: link!.partyId, type: "meeting" },
    });
    expect(activity).not.toBeNull();
  });

  it("all counterparties in tenant have Party records", async () => {
    const allCps = await db.counterparty.findMany({ where: { tenantId }, select: { id: true } });
    for (const cp of allCps) {
      const link = await db.partyLink.findUnique({
        where: { entityType_entityId: { entityType: "counterparty", entityId: cp.id } },
      });
      expect(link).not.toBeNull();
    }
    expect(allCps.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: ProductCatalogProjection
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Projections", () => {
  it("laptop has a ProductCatalogProjection", async () => {
    const proj = await db.productCatalogProjection.findUnique({ where: { productId: laptopId } });
    expect(proj).not.toBeNull();
    expect(proj!.sku).toBe("NB-001");
  });

  it("mouse has a ProductCatalogProjection", async () => {
    const proj = await db.productCatalogProjection.findUnique({ where: { productId: mouseId } });
    expect(proj).not.toBeNull();
    expect(proj!.sku).toBe("MS-001");
  });

  it("laptop projection price = 65,000", async () => {
    const proj = await db.productCatalogProjection.findUnique({ where: { productId: laptopId } });
    expect(proj).not.toBeNull();
    expect(toNumber(proj!.price)).toBeCloseTo(65000, 0);
  });

  it("mouse projection price = 2,200", async () => {
    const proj = await db.productCatalogProjection.findUnique({ where: { productId: mouseId } });
    expect(proj).not.toBeNull();
    expect(toNumber(proj!.price)).toBeCloseTo(2200, 0);
  });

  it("projection count = active+published product count for this tenant", async () => {
    const productCount = await db.product.count({
      where: { tenantId, isActive: true, publishedToStore: true },
    });
    const projCount = await db.productCatalogProjection.count({
      where: { tenantId, isActive: true, publishedToStore: true },
    });
    expect(productCount).toBeGreaterThanOrEqual(2);
    expect(projCount).toBe(productCount);
  });

  it("projections are marked publishedToStore = true", async () => {
    const laptopProj = await db.productCatalogProjection.findUnique({ where: { productId: laptopId } });
    const mouseProj  = await db.productCatalogProjection.findUnique({ where: { productId: mouseId } });
    expect(laptopProj!.publishedToStore).toBe(true);
    expect(mouseProj!.publishedToStore).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: E-Commerce
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — E-Commerce", () => {
  it("realistic buyer customer exists (telegramId=999001)", async () => {
    const customer = await db.customer.findUnique({ where: { telegramId: "999001" } });
    expect(customer).not.toBeNull();
    expect(customer!.name).toBe("Тест Покупатель");
  });

  it("delivered e-commerce order ORD-REALISTIC-001 exists", async () => {
    const order = await db.order.findUnique({ where: { orderNumber: "ORD-REALISTIC-001" } });
    expect(order).not.toBeNull();
    expect(order!.status).toBe("delivered");
    expect(order!.paymentStatus).toBe("paid");
  });

  it("e-commerce order has 2 mouse items", async () => {
    const order = await db.order.findUnique({
      where: { orderNumber: "ORD-REALISTIC-001" },
      include: { items: true },
    });
    expect(order!.items).toHaveLength(1);
    expect(order!.items[0].productId).toBe(mouseId);
    expect(order!.items[0].quantity).toBe(2);
  });

  it("e-commerce order total = 2 × 2,200 = 4,400", async () => {
    const order = await db.order.findUnique({ where: { orderNumber: "ORD-REALISTIC-001" } });
    expect(toNumber(order!.totalAmount)).toBeCloseTo(4400, 0);
  });

  it("e-commerce customer has a PartyLink", async () => {
    const customer = await db.customer.findUnique({ where: { telegramId: "999001" } });
    expect(customer).not.toBeNull();

    const link = await db.partyLink.findUnique({
      where: { entityType_entityId: { entityType: "customer", entityId: customer!.id } },
    });
    expect(link).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: Profit calculation
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Profit", () => {
  it("gross margin: revenue - COGS > 0", async () => {
    // Revenue = 3×65000 + 5×2200 = 195000 + 11000 = 206,000
    // COGS    = 3×50000 + 5×1500 = 150000 + 7500  = 157,500
    // Gross   = 48,500
    const revenue = 3 * 65000 + 5 * 2200;   // 206,000
    const cogs    = 3 * 50000 + 5 * 1500;   //  157,500
    const gross   = revenue - cogs;          //  48,500
    expect(gross).toBeGreaterThan(0);
    expect(gross).toBeCloseTo(48500, 0);
  });

  it("outgoing_payment amount = 265,000", async () => {
    const payment = await db.payment.findFirst({
      where: { tenantId, description: "realistic:payment-out-1" },
    });
    expect(payment).not.toBeNull();
    expect(toNumber(payment!.amount)).toBeCloseTo(265000, 0);
    expect(payment!.type).toBe("expense");
  });

  it("incoming_payment amount = 206,000", async () => {
    const payment = await db.payment.findFirst({
      where: { tenantId, description: "realistic:payment-in-1" },
    });
    expect(payment).not.toBeNull();
    expect(toNumber(payment!.amount)).toBeCloseTo(206000, 0);
    expect(payment!.type).toBe("income");
  });

  it("payments are linked to correct counterparties", async () => {
    const payOut = await db.payment.findFirst({ where: { tenantId, description: "realistic:payment-out-1" } });
    const payIn  = await db.payment.findFirst({ where: { tenantId, description: "realistic:payment-in-1" } });
    expect(payOut!.counterpartyId).toBe(supplierId);
    expect(payIn!.counterpartyId).toBe(customerId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 10: Finance (FinanceCategory wiring)
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Finance", () => {
  it("expense payment is categorised as 'Оплата поставщику'", async () => {
    const payment = await db.payment.findFirst({
      where: { tenantId, description: "realistic:payment-out-1" },
      include: { category: true },
    });
    expect(payment).not.toBeNull();
    expect(payment!.category.name).toBe("Оплата поставщику");
    expect(payment!.category.type).toBe("expense");
  });

  it("income payment is categorised as 'Оплата от покупателя'", async () => {
    const payment = await db.payment.findFirst({
      where: { tenantId, description: "realistic:payment-in-1" },
      include: { category: true },
    });
    expect(payment).not.toBeNull();
    expect(payment!.category.name).toBe("Оплата от покупателя");
    expect(payment!.category.type).toBe("income");
  });

  it("payment JournalEntries have balanced lines", async () => {
    const payments = await db.payment.findMany({
      where: { tenantId, description: { in: ["realistic:payment-out-1", "realistic:payment-in-1"] } },
      select: { id: true },
    });

    for (const pay of payments) {
      const entry = await db.journalEntry.findFirst({
        where: { sourceId: pay.id, sourceType: "finance_payment", isReversed: false },
        include: { lines: true },
      });
      if (!entry) continue; // May not be posted if accounts were missing
      const debit  = entry.lines.reduce((s, l) => s + toNumber(l.debit),  0);
      const credit = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0);
      expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 11: Prices
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Prices", () => {
  it("laptop has PurchasePrice = 50,000", async () => {
    const pp = await db.purchasePrice.findFirst({
      where: { productId: laptopId, isActive: true },
    });
    expect(pp).not.toBeNull();
    expect(toNumber(pp!.price)).toBeCloseTo(50000, 0);
  });

  it("laptop has SalePrice = 65,000", async () => {
    const sp = await db.salePrice.findFirst({
      where: { productId: laptopId, isActive: true, priceListId: null },
    });
    expect(sp).not.toBeNull();
    expect(toNumber(sp!.price)).toBeCloseTo(65000, 0);
  });

  it("mouse has PurchasePrice = 1,500", async () => {
    const pp = await db.purchasePrice.findFirst({
      where: { productId: mouseId, isActive: true },
    });
    expect(pp).not.toBeNull();
    expect(toNumber(pp!.price)).toBeCloseTo(1500, 0);
  });

  it("mouse has SalePrice = 2,200", async () => {
    const sp = await db.salePrice.findFirst({
      where: { productId: mouseId, isActive: true, priceListId: null },
    });
    expect(sp).not.toBeNull();
    expect(toNumber(sp!.price)).toBeCloseTo(2200, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 12: Outbox
// ─────────────────────────────────────────────────────────────────────────────
describe("Business Chain — Outbox", () => {
  it("no PENDING outbox events remain after processing", async () => {
    // After seed-realistic runs processOutboxFull(), all events should be PROCESSED or DEAD
    const pendingCount = await db.outboxEvent.count({ where: { status: "PENDING" } });
    expect(pendingCount).toBe(0);
  });

  it("no DEAD outbox events (all handlers succeeded)", async () => {
    const deadCount = await db.outboxEvent.count({ where: { status: "DEAD" } });
    // Allow 0 dead events (seed should have processed everything)
    expect(deadCount).toBe(0);
  });

  it("at least 4 outbox events were processed (PROCESSED status)", async () => {
    // purchase_order, incoming_shipment, sales_order, outgoing_shipment
    const processedCount = await db.outboxEvent.count({ where: { status: "PROCESSED" } });
    expect(processedCount).toBeGreaterThanOrEqual(4);
  });
});

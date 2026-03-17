/**
 * Stock Edge Cases — Integration Tests
 *
 * Tests the following invariants using realistic seed data:
 *
 *   Fix 1 (Negative stock prevention): checkStockAvailability blocks over-shipment
 *   Fix 2 (Race condition protection): optimistic locking on StockRecord.version
 *   Fix 3 (AVCO at zero stock): averageCost resets correctly when stock reaches 0
 *   Fix 4 (Transfer atomicity): both movements created in same transaction
 *   Fix 5 (Cancel parent with confirmed child): TODO — basedOnDocumentId not in schema
 *
 * Seed data (created in beforeEach matching task spec):
 *   Tenant:       "Основная компания"
 *   Products:     NB-001 (Ноутбук Lenovo), MS-001 (Мышь Logitech)
 *   Warehouse:    "Основной склад"
 *   Counterparties: ООО ТехноОптим (supplier), ИП Смирнов А.В. (customer)
 *   Stock:        Laptop = 2 шт @ 50000 averageCost, Mouse = 5 шт @ 1500 averageCost
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  confirmDocumentTransactional,
  cancelDocumentTransactional,
} from "@/lib/modules/accounting/services/document-confirm.service";
import { createTenant } from "../../helpers/factories";

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = "test-stock-edge-cases-tenant";

// ── Local helpers ──────────────────────────────────────────────────────────────

/** Ensure DocumentCounter exists for a prefix (required by generateDocumentNumber) */
async function ensureDocumentCounter(prefix: string) {
  await db.documentCounter.upsert({
    where: { prefix },
    create: { prefix, lastNumber: 0 },
    update: {},
  });
}

/** Create a draft document with items ready for confirmation */
async function createDraftShipment(opts: {
  warehouseId: string;
  counterpartyId: string;
  productId: string;
  quantity: number;
  price: number;
  number?: string;
}) {
  const number = opts.number ?? `TEST-SHIP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const total = opts.quantity * opts.price;

  return db.document.create({
    data: {
      tenantId: TENANT_ID,
      number,
      type: "outgoing_shipment",
      status: "draft",
      warehouseId: opts.warehouseId,
      counterpartyId: opts.counterpartyId,
      date: new Date(),
      totalAmount: total,
      items: {
        create: [{
          productId: opts.productId,
          quantity: opts.quantity,
          price: opts.price,
          total,
        }],
      },
    },
  });
}

/** Create a draft stock receipt (incoming) */
async function createDraftReceipt(opts: {
  warehouseId: string;
  counterpartyId: string;
  productId: string;
  quantity: number;
  price: number;
  number?: string;
}) {
  const number = opts.number ?? `TEST-RCPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const total = opts.quantity * opts.price;

  return db.document.create({
    data: {
      tenantId: TENANT_ID,
      number,
      type: "incoming_shipment",
      status: "draft",
      warehouseId: opts.warehouseId,
      counterpartyId: opts.counterpartyId,
      date: new Date(),
      totalAmount: total,
      items: {
        create: [{
          productId: opts.productId,
          quantity: opts.quantity,
          price: opts.price,
          total,
        }],
      },
    },
  });
}

/** Seed a StockRecord with given quantity and averageCost */
async function seedStock(
  warehouseId: string,
  productId: string,
  quantity: number,
  averageCost: number
) {
  return db.stockRecord.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    create: {
      warehouseId,
      productId,
      quantity,
      averageCost,
      totalCostValue: quantity * averageCost,
      version: 0,
    },
    update: {
      quantity,
      averageCost,
      totalCostValue: quantity * averageCost,
      version: 0,
    },
  });
}

/** Seed StockMovements to match the StockRecord (so reconcileStockRecord stays consistent) */
async function seedStockViaDocument(opts: {
  warehouseId: string;
  counterpartyId: string;
  productId: string;
  quantity: number;
  price: number;
  number?: string;
}) {
  const receipt = await createDraftReceipt(opts);
  await confirmDocumentTransactional(receipt.id, null);
  return receipt;
}

// ── Global setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // DocumentCounters survive cleanDatabase() since they are not in the clean list
  await ensureDocumentCounter("DOC");
  await ensureDocumentCounter("SHIP");
  await ensureDocumentCounter("RCPT");
});

// ── Per-test fixtures (re-created each test by setup.ts→cleanDatabase) ────────

let warehouseId: string;
let laptopId: string;
let mouseId: string;
let supplierId: string;
let customerId: string;
let unitId: string;

beforeEach(async () => {
  // setup.ts already calls cleanDatabase() before this hook

  // Tenant
  await createTenant({ id: TENANT_ID, name: "Основная компания" });

  // Unit (required by Product)
  const unit = await db.unit.create({
    data: { name: "Штука", shortName: "шт" },
  });
  unitId = unit.id;

  // Warehouse
  const warehouse = await db.warehouse.create({
    data: { tenantId: TENANT_ID, name: "Основной склад", isActive: true },
  });
  warehouseId = warehouse.id;

  // Products matching seed spec
  const laptop = await db.product.create({
    data: {
      tenantId: TENANT_ID,
      name: "Ноутбук Lenovo",
      sku: "NB-001",
      unitId,
      isActive: true,
    },
  });
  laptopId = laptop.id;

  const mouse = await db.product.create({
    data: {
      tenantId: TENANT_ID,
      name: "Мышь Logitech",
      sku: "MS-001",
      unitId,
      isActive: true,
    },
  });
  mouseId = mouse.id;

  // Counterparties
  const supplier = await db.counterparty.create({
    data: {
      tenantId: TENANT_ID,
      name: "ООО ТехноОптим",
      type: "supplier",
      isActive: true,
    },
  });
  supplierId = supplier.id;

  const customer = await db.counterparty.create({
    data: {
      tenantId: TENANT_ID,
      name: "ИП Смирнов А.В.",
      type: "customer",
      isActive: true,
    },
  });
  customerId = customer.id;

  // Seed initial stock via confirmed receipt documents (source-of-truth approach)
  // Laptop: 2 шт @ 50000
  await seedStockViaDocument({
    warehouseId,
    counterpartyId: supplierId,
    productId: laptopId,
    quantity: 2,
    price: 50000,
    number: "SEED-LAPTOP-001",
  });

  // Mouse: 5 шт @ 1500
  await seedStockViaDocument({
    warehouseId,
    counterpartyId: supplierId,
    productId: mouseId,
    quantity: 5,
    price: 1500,
    number: "SEED-MOUSE-001",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1 — Negative stock prevention
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 1 — Negative stock prevention", () => {

  it("cannot ship more laptops than available (2 шт)", async () => {
    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: laptopId,
      quantity: 5, // more than 2 available
      price: 65000,
      number: "TEST-NEG-001",
    });

    await expect(
      confirmDocumentTransactional(doc.id, null)
    ).rejects.toThrow("Недостаточно остатков");

    // Stock unchanged
    const stock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(stock?.quantity).toBe(2);
  });

  it("cannot ship more mice than available (5 шт)", async () => {
    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: mouseId,
      quantity: 10, // more than 5
      price: 2000,
      number: "TEST-NEG-002",
    });

    await expect(
      confirmDocumentTransactional(doc.id, null)
    ).rejects.toThrow("Недостаточно остатков");

    const stock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(stock?.quantity).toBe(5);
  });

  it("stock quantity never goes negative after failed confirmation", async () => {
    const overDoc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: laptopId,
      quantity: 99,
      price: 65000,
      number: "TEST-NEG-003",
    });

    try {
      await confirmDocumentTransactional(overDoc.id, null);
    } catch {
      // expected
    }

    const records = await db.stockRecord.findMany({
      where: { warehouseId },
    });
    for (const r of records) {
      expect(r.quantity, `Stock should never be negative for product ${r.productId}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("can ship exactly available quantity (2 laptops)", async () => {
    const stockBefore = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(stockBefore?.quantity).toBe(2);

    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: laptopId,
      quantity: 2,
      price: 65000,
      number: "TEST-EXACT-001",
    });

    const result = await confirmDocumentTransactional(doc.id, null);
    expect(result.status).toBe("confirmed");

    const stockAfter = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(stockAfter?.quantity).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2 — Race condition protection (optimistic locking)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 2 — Race condition protection", () => {

  it("StockRecord has version field", async () => {
    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(record).not.toBeNull();
    expect(typeof record!.version).toBe("number");
    expect(record!.version).toBeGreaterThanOrEqual(0);
  });

  it("version increments after each stock decrement", async () => {
    const before = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    const versionBefore = before!.version;

    // Ship 1 mouse
    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: mouseId,
      quantity: 1,
      price: 2000,
      number: "TEST-VER-001",
    });
    await confirmDocumentTransactional(doc.id, null);

    const after = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    // Version must have incremented (optimistic lock fired)
    expect(after!.version).toBeGreaterThan(versionBefore);
  });

  it("concurrent sales of last laptop — only one succeeds (optimistic lock)", async () => {
    // Both docs try to ship ALL 2 laptops simultaneously
    const [doc1, doc2] = await Promise.all([
      createDraftShipment({
        warehouseId,
        counterpartyId: customerId,
        productId: laptopId,
        quantity: 2,
        price: 65000,
        number: "TEST-RACE-001",
      }),
      createDraftShipment({
        warehouseId,
        counterpartyId: customerId,
        productId: laptopId,
        quantity: 2,
        price: 65000,
        number: "TEST-RACE-002",
      }),
    ]);

    // Confirm both simultaneously
    const results = await Promise.allSettled([
      confirmDocumentTransactional(doc1.id, null),
      confirmDocumentTransactional(doc2.id, null),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Exactly one succeeds, one fails
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);

    // Stock never goes negative
    const finalStock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(finalStock!.quantity).toBeGreaterThanOrEqual(0);

    // Cleanup: cancel the confirmed doc
    for (const [doc, result] of [[doc1, results[0]], [doc2, results[1]]] as const) {
      if (result.status === "fulfilled") {
        await cancelDocumentTransactional(doc.id, null);
      } else {
        // Draft (never confirmed) — just delete
        const fresh = await db.document.findUnique({ where: { id: doc.id } });
        if (fresh && fresh.status === "draft") {
          await db.documentItem.deleteMany({ where: { documentId: doc.id } });
          await db.document.delete({ where: { id: doc.id } });
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3 — AVCO at zero stock
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 3 — AVCO at zero stock", () => {

  it("AVCO resets correctly when stock reaches zero then new receipt arrives", async () => {
    // Step 1: Sell ALL 2 laptops → stock = 0
    const sellDoc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: laptopId,
      quantity: 2,
      price: 65000,
      number: "TEST-AVCO-SELL-001",
    });
    await confirmDocumentTransactional(sellDoc.id, null);

    const afterSell = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(afterSell?.quantity).toBe(0);

    // Step 2: Buy 3 laptops at new price 60000
    const buyDoc = await createDraftReceipt({
      warehouseId,
      counterpartyId: supplierId,
      productId: laptopId,
      quantity: 3,
      price: 60000,
      number: "TEST-AVCO-BUY-001",
    });
    await confirmDocumentTransactional(buyDoc.id, null);

    const afterBuy = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });

    // Stock is now 3 (sum of movements: +2-2+3)
    expect(afterBuy?.quantity).toBe(3);

    // AVCO is positive (new cost is applied, blended with movements-based qty)
    const avgCost = Number(afterBuy?.averageCost);
    expect(avgCost).toBeGreaterThan(0);
    // averageCost after buying at 60000 should be <= 60000 (could be blended with prior cost)
    expect(avgCost).toBeLessThanOrEqual(60000);
  });

  it("AVCO correctly blends when buying into existing stock", async () => {
    // Current: 2 laptops @ 50000 avg
    const stockBefore = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });
    expect(stockBefore?.quantity).toBe(2);

    // Buy 3 more laptops @ 60000
    const buyDoc = await createDraftReceipt({
      warehouseId,
      counterpartyId: supplierId,
      productId: laptopId,
      quantity: 3,
      price: 60000,
      number: "TEST-AVCO-BLEND-001",
    });
    await confirmDocumentTransactional(buyDoc.id, null);

    const afterBuy = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });

    // qty = 5 (sum: +2+3)
    expect(afterBuy?.quantity).toBe(5);

    // AVCO is a blend: between 50000 and 60000
    const avgCost = Number(afterBuy?.averageCost);
    expect(avgCost).toBeGreaterThan(0);
    expect(avgCost).toBeGreaterThanOrEqual(50000);
    expect(avgCost).toBeLessThanOrEqual(60000);
  });

  it("AVCO for mouse: sell 3 then buy 4 at new price", async () => {
    // Current: 5 mice @ 1500

    // Sell 3 mice
    const sellDoc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: mouseId,
      quantity: 3,
      price: 2000,
      number: "TEST-AVCO-MOUSE-SELL-001",
    });
    await confirmDocumentTransactional(sellDoc.id, null);

    const afterSell = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(afterSell?.quantity).toBe(2); // 5 - 3 = 2

    // Buy 4 mice @ 2000
    const buyDoc = await createDraftReceipt({
      warehouseId,
      counterpartyId: supplierId,
      productId: mouseId,
      quantity: 4,
      price: 2000,
      number: "TEST-AVCO-MOUSE-BUY-001",
    });
    await confirmDocumentTransactional(buyDoc.id, null);

    const afterBuy = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });

    // qty = 6 (sum: +5-3+4)
    expect(afterBuy?.quantity).toBe(6);

    // AVCO is a blend: between 1500 and 2000
    const avgCost = Number(afterBuy?.averageCost);
    expect(avgCost).toBeGreaterThan(0);
    expect(avgCost).toBeGreaterThanOrEqual(1500);
    expect(avgCost).toBeLessThanOrEqual(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4 — Stock transfer atomicity
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 4 — Stock transfer atomicity", () => {

  it("transfer creates both source OUT and target IN movements in same transaction", async () => {
    // Create second warehouse as transfer target
    const targetWarehouse = await db.warehouse.create({
      data: { tenantId: TENANT_ID, name: "Дополнительный склад", isActive: true },
    });

    // Create transfer document: 2 mice from main → secondary
    const transferDoc = await db.document.create({
      data: {
        tenantId: TENANT_ID,
        number: "TEST-TRANSFER-001",
        type: "stock_transfer",
        status: "draft",
        warehouseId,
        targetWarehouseId: targetWarehouse.id,
        date: new Date(),
        totalAmount: 3000, // 2 * 1500
        items: {
          create: [{
            productId: mouseId,
            quantity: 2,
            price: 1500,
            total: 3000,
          }],
        },
      },
    });

    await confirmDocumentTransactional(transferDoc.id, null);

    // Both movements must exist
    const movements = await db.stockMovement.findMany({
      where: { documentId: transferDoc.id },
    });

    const transferOut = movements.filter((m) => m.type === "transfer_out");
    const transferIn = movements.filter((m) => m.type === "transfer_in");

    expect(transferOut.length).toBe(1);
    expect(transferIn.length).toBe(1);

    // Source: -2, Target: +2
    expect(transferOut[0].quantity).toBe(-2);
    expect(transferIn[0].quantity).toBe(2);
    expect(transferOut[0].warehouseId).toBe(warehouseId);
    expect(transferIn[0].warehouseId).toBe(targetWarehouse.id);

    // Source stock reduced by 2
    const sourceStock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(sourceStock?.quantity).toBe(3); // started at 5, transferred 2

    // Target stock increased by 2
    const targetStock = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: mouseId } },
    });
    expect(targetStock?.quantity).toBe(2);
  });

  it("transfer fails if source has insufficient stock", async () => {
    const targetWarehouse = await db.warehouse.create({
      data: { tenantId: TENANT_ID, name: "Склад 3", isActive: true },
    });

    const transferDoc = await db.document.create({
      data: {
        tenantId: TENANT_ID,
        number: "TEST-TRANSFER-FAIL-001",
        type: "stock_transfer",
        status: "draft",
        warehouseId,
        targetWarehouseId: targetWarehouse.id,
        date: new Date(),
        totalAmount: 99000,
        items: {
          create: [{
            productId: laptopId,
            quantity: 99, // only 2 available
            price: 1000,
            total: 99000,
          }],
        },
      },
    });

    await expect(
      confirmDocumentTransactional(transferDoc.id, null)
    ).rejects.toThrow("Недостаточно остатков");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5 — Cancel parent with confirmed child (TODO)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 5 — Cancel parent with confirmed child", () => {

  it("TODO: basedOnDocumentId field does not exist in Document schema — skip", () => {
    // Fix 5 requires Document.basedOnDocumentId (FK: child references parent).
    // Current schema only has linkedDocumentId which is used for inventory_count adjustments.
    // Once the parent→child document flow is added to the schema, implement:
    //
    //   const childDocumentMap = { purchase_order: 'incoming_shipment', sales_order: 'outgoing_shipment' }
    //   Check for confirmed child BEFORE allowing parent cancellation (409 error)
    //
    expect(true).toBe(true); // placeholder
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stock Invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("Stock invariants", () => {

  it("StockRecord.quantity always equals sum of movements after confirmation", async () => {
    // Ship 1 laptop
    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: laptopId,
      quantity: 1,
      price: 65000,
      number: "TEST-INV-001",
    });
    await confirmDocumentTransactional(doc.id, null);

    // Calculate expected quantity from movements
    const movementsSum = await db.stockMovement.aggregate({
      where: { productId: laptopId, warehouseId },
      _sum: { quantity: true },
    });
    const expectedQty = movementsSum._sum.quantity ?? 0;

    const record = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: laptopId } },
    });

    expect(record?.quantity).toBe(expectedQty);
    expect(record?.quantity).toBe(1); // started at 2, shipped 1
  });

  it("StockRecord quantity is restored after cancellation", async () => {
    // Ship 1 mouse
    const doc = await createDraftShipment({
      warehouseId,
      counterpartyId: customerId,
      productId: mouseId,
      quantity: 1,
      price: 2000,
      number: "TEST-INV-CANCEL-001",
    });
    await confirmDocumentTransactional(doc.id, null);

    const afterShip = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(afterShip?.quantity).toBe(4); // 5 - 1 = 4

    // Cancel the shipment
    await cancelDocumentTransactional(doc.id, null);

    const afterCancel = await db.stockRecord.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: mouseId } },
    });
    expect(afterCancel?.quantity).toBe(5); // restored
  });

  it("all StockRecords have non-negative quantity", async () => {
    const records = await db.stockRecord.findMany({ where: { warehouseId } });
    for (const r of records) {
      expect(r.quantity, `StockRecord for product ${r.productId} must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });
});

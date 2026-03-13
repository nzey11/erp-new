/**
 * COGS Service Tests
 *
 * Tests calculateCogsForShipment and getCogsFromLedger against a real DB.
 *
 * Placement: tests/unit/lib/ (service-level, DB-backed logic)
 * Runner:    vitest.service.config.ts  (npm run test:service)
 *            NOT included in vitest.unit.config.ts (pure unit, no DB)
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  calculateCogsForShipment,
  getCogsFromLedger,
} from "@/lib/modules/accounting/finance/cogs";
import {
  createDocument,
  createDocumentItem,
  createProduct,
  createWarehouse,
  createStockRecord,
  seedTestAccounts,
  seedCompanySettings,
} from "../../helpers/factories";
import { cleanDatabase } from "../../helpers/test-db";

// =============================================
// calculateCogsForShipment
// =============================================

describe("calculateCogsForShipment", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product   = await createProduct();
  });

  it("returns {totalCogs: 0, lines: []} for non-shipment document", async () => {
    const doc = await createDocument({
      type: "stock_receipt",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 100 });

    const result = await calculateCogsForShipment(doc.id);

    expect(result.totalCogs).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("returns {totalCogs: 0, lines: []} for non-existent document", async () => {
    const result = await calculateCogsForShipment("non-existent-id");
    expect(result.totalCogs).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("returns COGS = quantity × averageCost from StockRecord", async () => {
    // Seed StockRecord with averageCost = 200
    await createStockRecord(warehouse.id, product.id, 100);
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      data: { averageCost: 200, totalCostValue: 20000 },
    });

    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 5, price: 300 });

    const result = await calculateCogsForShipment(doc.id);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].averageCost).toBe(200);
    expect(result.lines[0].cogs).toBe(1000);       // 5 × 200
    expect(result.totalCogs).toBe(1000);
  });

  it("uses averageCost = 0 when no StockRecord exists (edge case)", async () => {
    // No StockRecord created — product not yet received
    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 3, price: 500 });

    const result = await calculateCogsForShipment(doc.id);

    expect(result.lines[0].averageCost).toBe(0);
    expect(result.lines[0].cogs).toBe(0);
    expect(result.totalCogs).toBe(0);
  });

  it("multi-item: COGS calculated per item, totalCogs = sum", async () => {
    const product2 = await createProduct();

    // Seed different average costs for each product
    await createStockRecord(warehouse.id, product.id, 50);
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      data: { averageCost: 100 },
    });

    await createStockRecord(warehouse.id, product2.id, 30);
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product2.id } },
      data: { averageCost: 150 },
    });

    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id,  { quantity: 10, price: 200 }); // COGS = 10×100 = 1000
    await createDocumentItem(doc.id, product2.id, { quantity:  5, price: 300 }); // COGS = 5×150  = 750

    const result = await calculateCogsForShipment(doc.id);

    expect(result.lines).toHaveLength(2);
    expect(result.totalCogs).toBe(1750); // 1000 + 750
  });

  it("line contains correct productId and quantity", async () => {
    await createStockRecord(warehouse.id, product.id, 100);
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      data: { averageCost: 50 },
    });

    const doc = await createDocument({
      type: "outgoing_shipment",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 7, price: 100 });

    const result = await calculateCogsForShipment(doc.id);

    expect(result.lines[0].productId).toBe(product.id);
    expect(result.lines[0].quantity).toBe(7);
  });
});

// =============================================
// getCogsFromLedger
// =============================================

describe("getCogsFromLedger", () => {
  let accountIds: Record<string, string>;

  beforeEach(async () => {
    await cleanDatabase();
    accountIds = await seedTestAccounts();
    await seedCompanySettings(accountIds);
  });

  it("returns 0 when no entries exist in period", async () => {
    const from = new Date("2025-01-01");
    const to   = new Date("2025-12-31");

    const result = await getCogsFromLedger(from, to);
    expect(result).toBe(0);
  });

  it("returns sum of debit turnovers on account 90.2 in date range", async () => {
    const cogsAccountId = accountIds["90.2"];
    const otherAccountId = accountIds["62"];

    // Create a journal entry inside the period
    const date = new Date("2025-06-15");
    const entry = await db.journalEntry.create({
      data: {
        number:      "JE-TEST-001",
        date,
        description: "COGS entry",
        isManual:    false,
        isReversed:  false,
        lines: {
          create: [
            { accountId: cogsAccountId,  debit: 3000, credit: 0,    currency: "RUB", amountRub: 3000 },
            { accountId: otherAccountId, debit: 0,    credit: 3000, currency: "RUB", amountRub: 3000 },
          ],
        },
      },
    });
    expect(entry.id).toBeDefined();

    const result = await getCogsFromLedger(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toBe(3000);
  });

  it("sums multiple entries correctly", async () => {
    const cogsId  = accountIds["90.2"];
    const otherId = accountIds["62"];

    for (const [num, amount] of [["JE-T-001", 1000], ["JE-T-002", 2500], ["JE-T-003", 500]] as const) {
      await db.journalEntry.create({
        data: {
          number:     num,
          date:       new Date("2025-06-01"),
          isManual:   false,
          isReversed: false,
          lines: {
            create: [
              { accountId: cogsId,  debit: amount, credit: 0,      currency: "RUB", amountRub: amount },
              { accountId: otherId, debit: 0,       credit: amount, currency: "RUB", amountRub: amount },
            ],
          },
        },
      });
    }

    const result = await getCogsFromLedger(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toBe(4000); // 1000 + 2500 + 500
  });

  it("excludes entries outside the date range", async () => {
    const cogsId  = accountIds["90.2"];
    const otherId = accountIds["62"];

    // Entry inside range
    await db.journalEntry.create({
      data: {
        number: "JE-IN-001", date: new Date("2025-06-01"),
        isManual: false, isReversed: false,
        lines: { create: [
          { accountId: cogsId,  debit: 500, credit: 0,   currency: "RUB", amountRub: 500 },
          { accountId: otherId, debit: 0,   credit: 500, currency: "RUB", amountRub: 500 },
        ]},
      },
    });

    // Entry OUTSIDE range (2024)
    await db.journalEntry.create({
      data: {
        number: "JE-OUT-001", date: new Date("2024-12-31"),
        isManual: false, isReversed: false,
        lines: { create: [
          { accountId: cogsId,  debit: 9999, credit: 0,    currency: "RUB", amountRub: 9999 },
          { accountId: otherId, debit: 0,    credit: 9999, currency: "RUB", amountRub: 9999 },
        ]},
      },
    });

    const result = await getCogsFromLedger(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toBe(500); // only the in-range entry
  });

  it("excludes reversed entries (isReversed = true)", async () => {
    const cogsId  = accountIds["90.2"];
    const otherId = accountIds["62"];

    await db.journalEntry.create({
      data: {
        number: "JE-REV-001", date: new Date("2025-06-01"),
        isManual: false, isReversed: true, // reversed — must be excluded
        lines: { create: [
          { accountId: cogsId,  debit: 7777, credit: 0,    currency: "RUB", amountRub: 7777 },
          { accountId: otherId, debit: 0,    credit: 7777, currency: "RUB", amountRub: 7777 },
        ]},
      },
    });

    const result = await getCogsFromLedger(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toBe(0);
  });
});

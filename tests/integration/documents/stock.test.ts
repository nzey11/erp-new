import { describe, it, expect, beforeEach } from "vitest";
import { cleanDatabase } from "../../helpers/test-db";
import {
  createWarehouse,
  createProduct,
  createDocument,
  createDocumentItem,
  createStockRecord,
} from "../../helpers/factories";
import {
  recalculateStock,
  checkStockAvailability,
  getProductStock,
  getProductTotalStock,
  updateAverageCostOnReceipt,
  updateAverageCostOnTransfer,
  updateTotalCostValue,
} from "@/lib/modules/accounting/stock";
import { db } from "@/lib/shared/db";

describe("lib/stock - integration", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe("recalculateStock", () => {
    it("should return 0 for product with no documents", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(0);
    });

    it("should increase stock for confirmed stock_receipt", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create confirmed stock_receipt document with 10 units
      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(10);
    });

    it("should increase stock for confirmed incoming_shipment", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(doc.id, product.id, { quantity: 25 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(25);
    });

    it("should decrease stock for confirmed write_off", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // First add some stock
      const receipt = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(receipt.id, product.id, { quantity: 100 });

      // Then write off some
      const writeOff = await createDocument({
        type: "write_off",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(writeOff.id, product.id, { quantity: 30 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(70); // 100 - 30
    });

    it("should decrease stock for confirmed outgoing_shipment", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Add stock
      const receipt = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(receipt.id, product.id, { quantity: 50 });

      // Ship out
      const shipment = await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(shipment.id, product.id, { quantity: 15 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(35); // 50 - 15
    });

    it("should handle stock_transfer between warehouses", async () => {
      const sourceWarehouse = await createWarehouse({ name: "Склад источник" });
      const targetWarehouse = await createWarehouse({ name: "Склад назначения" });
      const product = await createProduct();

      // Add initial stock to source warehouse
      const receipt = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: sourceWarehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(receipt.id, product.id, { quantity: 100 });

      // Transfer from source to target
      const transfer = await createDocument({
        type: "stock_transfer",
        status: "confirmed",
        warehouseId: sourceWarehouse.id,
        targetWarehouseId: targetWarehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(transfer.id, product.id, { quantity: 40 });

      // Recalculate both warehouses
      const sourceQty = await recalculateStock(sourceWarehouse.id, product.id);
      const targetQty = await recalculateStock(targetWarehouse.id, product.id);

      expect(sourceQty).toBe(60); // 100 - 40
      expect(targetQty).toBe(40); // 0 + 40
    });

    it("should not count draft documents", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create draft document (should not affect stock)
      const doc = await createDocument({
        type: "stock_receipt",
        status: "draft",
        warehouseId: warehouse.id,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 50 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(0);
    });

    it("should not count cancelled documents", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create cancelled document
      const doc = await createDocument({
        type: "stock_receipt",
        status: "cancelled",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
        cancelledAt: new Date(),
      });
      await createDocumentItem(doc.id, product.id, { quantity: 50 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(0);
    });

    it("should handle multiple products in same document", async () => {
      const warehouse = await createWarehouse();
      const product1 = await createProduct({ name: "Товар 1" });
      const product2 = await createProduct({ name: "Товар 2" });

      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(doc.id, product1.id, { quantity: 10 });
      await createDocumentItem(doc.id, product2.id, { quantity: 20 });

      const qty1 = await recalculateStock(warehouse.id, product1.id);
      const qty2 = await recalculateStock(warehouse.id, product2.id);

      expect(qty1).toBe(10);
      expect(qty2).toBe(20);
    });

    it("should handle customer_return as stock increase", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      const doc = await createDocument({
        type: "customer_return",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(doc.id, product.id, { quantity: 5 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(5);
    });

    it("should handle supplier_return as stock decrease", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Add stock first
      const receipt = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(receipt.id, product.id, { quantity: 20 });

      // Return to supplier
      const returnDoc = await createDocument({
        type: "supplier_return",
        status: "confirmed",
        warehouseId: warehouse.id,
        confirmedAt: new Date(),
      });
      await createDocumentItem(returnDoc.id, product.id, { quantity: 8 });

      const quantity = await recalculateStock(warehouse.id, product.id);

      expect(quantity).toBe(12); // 20 - 8
    });
  });

  describe("checkStockAvailability", () => {
    it("should return empty array when stock is sufficient", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create stock record
      await createStockRecord(warehouse.id, product.id, 100);

      const shortages = await checkStockAvailability(warehouse.id, [
        { productId: product.id, quantity: 50 },
      ]);

      expect(shortages).toHaveLength(0);
    });

    it("should return shortage when stock is insufficient", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create stock record with only 10 units
      await createStockRecord(warehouse.id, product.id, 10);

      const shortages = await checkStockAvailability(warehouse.id, [
        { productId: product.id, quantity: 50 },
      ]);

      expect(shortages).toHaveLength(1);
      expect(shortages[0]).toMatchObject({
        productId: product.id,
        available: 10,
        required: 50,
      });
    });

    it("should return shortage when product has no stock record", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // No stock record created

      const shortages = await checkStockAvailability(warehouse.id, [
        { productId: product.id, quantity: 10 },
      ]);

      expect(shortages).toHaveLength(1);
      expect(shortages[0]).toMatchObject({
        productId: product.id,
        available: 0,
        required: 10,
      });
    });

    it("should check multiple products", async () => {
      const warehouse = await createWarehouse();
      const product1 = await createProduct({ name: "Товар 1" });
      const product2 = await createProduct({ name: "Товар 2" });

      await createStockRecord(warehouse.id, product1.id, 100);
      await createStockRecord(warehouse.id, product2.id, 5);

      const shortages = await checkStockAvailability(warehouse.id, [
        { productId: product1.id, quantity: 50 }, // OK
        { productId: product2.id, quantity: 20 }, // Shortage
      ]);

      expect(shortages).toHaveLength(1);
      expect(shortages[0].productId).toBe(product2.id);
    });
  });

  describe("getProductStock", () => {
    it("should return 0 for product with no stock record", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      const stock = await getProductStock(warehouse.id, product.id);

      expect(stock).toBe(0);
    });

    it("should return correct stock quantity", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      await createStockRecord(warehouse.id, product.id, 42);

      const stock = await getProductStock(warehouse.id, product.id);

      expect(stock).toBe(42);
    });
  });

  describe("getProductTotalStock", () => {
    it("should return 0 for product with no stock records", async () => {
      const product = await createProduct();

      const total = await getProductTotalStock(product.id);

      expect(total).toBe(0);
    });

    it("should sum stock across all warehouses", async () => {
      const warehouse1 = await createWarehouse({ name: "Склад 1" });
      const warehouse2 = await createWarehouse({ name: "Склад 2" });
      const product = await createProduct();

      await createStockRecord(warehouse1.id, product.id, 30);
      await createStockRecord(warehouse2.id, product.id, 70);

      const total = await getProductTotalStock(product.id);

      expect(total).toBe(100); // 30 + 70
    });
  });

  describe("updateAverageCostOnReceipt - moving average cost", () => {
    it("should set averageCost to incomingPrice for first receipt", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // First receipt: 100 units @ 50₽
      await updateAverageCostOnReceipt(warehouse.id, product.id, 100, 50);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record?.averageCost).toBe(50);
    });

    it("should calculate moving average for second receipt", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create initial stock record
      await createStockRecord(warehouse.id, product.id, 100);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        data: { averageCost: 50, totalCostValue: 5000 },
      });

      // Second receipt: 50 units @ 80₽
      // Expected: (100 * 50 + 50 * 80) / 150 = (5000 + 4000) / 150 = 60
      await updateAverageCostOnReceipt(warehouse.id, product.id, 50, 80);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record?.averageCost).toBe(60);
      expect(record?.totalCostValue).toBe(150 * 60); // 9000
    });

    it("should handle zero initial quantity", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create stock record with 0 quantity
      await createStockRecord(warehouse.id, product.id, 0);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        data: { averageCost: 0, totalCostValue: 0 },
      });

      // Receipt: 10 units @ 100₽
      await updateAverageCostOnReceipt(warehouse.id, product.id, 10, 100);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record?.averageCost).toBe(100);
    });

    it("should create stock record if not exists", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // No stock record exists
      await updateAverageCostOnReceipt(warehouse.id, product.id, 25, 200);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record).not.toBeNull();
      expect(record?.averageCost).toBe(200);
      expect(record?.quantity).toBe(0); // quantity is managed by recalculateStock
    });

    it("should correctly calculate averageCost for multiple receipts", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Receipt 1: 100 units @ 50₽ → avgCost = 50
      await createStockRecord(warehouse.id, product.id, 0);
      await updateAverageCostOnReceipt(warehouse.id, product.id, 100, 50);

      // Update quantity to match
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        data: { quantity: 100 },
      });

      // Receipt 2: 50 units @ 80₽ → avgCost = (100*50 + 50*80) / 150 = 60
      await updateAverageCostOnReceipt(warehouse.id, product.id, 50, 80);

      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        data: { quantity: 150 },
      });

      // Receipt 3: 30 units @ 90₽ → avgCost = (150*60 + 30*90) / 180 = (9000 + 2700) / 180 = 65
      await updateAverageCostOnReceipt(warehouse.id, product.id, 30, 90);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record?.averageCost).toBe(65);
    });
  });

  describe("updateAverageCostOnTransfer", () => {
    it("should transfer stock at source averageCost", async () => {
      const sourceWarehouse = await createWarehouse({ name: "Склад-источник" });
      const targetWarehouse = await createWarehouse({ name: "Склад-получатель" });
      const product = await createProduct();

      // Set up source warehouse: 100 units @ 60₽ avg
      await createStockRecord(sourceWarehouse.id, product.id, 100);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: sourceWarehouse.id, productId: product.id } },
        data: { averageCost: 60, totalCostValue: 6000 },
      });

      // Transfer 30 units to target
      await updateAverageCostOnTransfer(
        sourceWarehouse.id,
        targetWarehouse.id,
        product.id,
        30
      );

      const targetRecord = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: product.id } },
      });

      // Target should have avgCost = 60 (same as source)
      expect(targetRecord?.averageCost).toBe(60);
    });

    it("should blend averageCost if target already has stock", async () => {
      const sourceWarehouse = await createWarehouse({ name: "Склад-источник" });
      const targetWarehouse = await createWarehouse({ name: "Склад-получатель" });
      const product = await createProduct();

      // Source: 100 units @ 100₽
      await createStockRecord(sourceWarehouse.id, product.id, 100);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: sourceWarehouse.id, productId: product.id } },
        data: { averageCost: 100, totalCostValue: 10000 },
      });

      // Target: 50 units @ 50₽
      await createStockRecord(targetWarehouse.id, product.id, 50);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: product.id } },
        data: { averageCost: 50, totalCostValue: 2500 },
      });

      // Transfer 50 units from source to target
      // Target new avgCost = (50*50 + 50*100) / 100 = 7500 / 100 = 75
      await updateAverageCostOnTransfer(
        sourceWarehouse.id,
        targetWarehouse.id,
        product.id,
        50
      );

      const targetRecord = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: product.id } },
      });

      expect(targetRecord?.averageCost).toBe(75);
    });
  });

  describe("updateTotalCostValue", () => {
    it("should recalculate totalCostValue from quantity and averageCost", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Create stock: 100 units @ 50₽ avg
      await createStockRecord(warehouse.id, product.id, 100);
      await db.stockRecord.update({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        data: { averageCost: 50, totalCostValue: 0 }, // totalCostValue is wrong
      });

      await updateTotalCostValue(warehouse.id, product.id);

      const record = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });

      expect(record?.totalCostValue).toBe(5000); // 100 * 50
    });

    it("should do nothing if stock record does not exist", async () => {
      const warehouse = await createWarehouse();
      const product = await createProduct();

      // Should not throw
      await expect(updateTotalCostValue(warehouse.id, product.id)).resolves.not.toThrow();
    });
  });
});

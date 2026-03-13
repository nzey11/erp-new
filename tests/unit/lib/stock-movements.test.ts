import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  createMovementsForDocument,
  createReversingMovements,
  hasReversingMovements,
  calculateStockFromMovements,
  reconcileStockRecord,
  type DocumentForMovements,
} from "@/lib/modules/accounting/stock-movements";
import {
  createWarehouse,
  createProduct,
  createDocument,
  createDocumentItem,
} from "../../helpers/factories";
import { cleanDatabase } from "../../helpers/test-db";
import {
  assertStockRecord,
  assertStockMatchesMovements,
  assertMovementCount,
  assertMovementsType,
  assertReversingMovementsNegate,
  assertIdempotentOperation,
} from "../../helpers/stock-assertions";

describe("StockMovementService", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product = await createProduct();
  });

  // Helper to create document with items for movements
  async function createDocForMovements(
    docOverrides: Parameters<typeof createDocument>[0],
    items: Array<{ productId: string; quantity: number; price: number }>
  ): Promise<DocumentForMovements> {
    const doc = await createDocument(docOverrides);
    for (const item of items) {
      await createDocumentItem(doc.id, item.productId, {
        quantity: item.quantity,
        price: item.price,
      });
    }
    return {
      id: doc.id,
      type: doc.type,
      warehouseId: doc.warehouseId,
      targetWarehouseId: doc.targetWarehouseId,
      items,
    };
  }

  describe("incoming_shipment: confirm → cancel", () => {
    it("confirm creates one movement with correct type", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );

      const result = await createMovementsForDocument(docForMovements);

      expect(result.created).toBe(1);

      const movements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("receipt");
      expect(movements[0].quantity).toBe(10);
      expect(movements[0].isReversing).toBe(false);
    });

    it("confirm updates StockRecord correctly", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );

      await createMovementsForDocument(docForMovements);

      const stockRecord = await db.stockRecord.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
      });

      expect(stockRecord).toBeDefined();
      expect(stockRecord!.quantity).toBe(10);
    });

    it("duplicate confirm is idempotent (no second movement)", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );

      // First confirm
      const result1 = await createMovementsForDocument(docForMovements);
      expect(result1.created).toBe(1);

      // Second confirm (should be idempotent)
      const result2 = await createMovementsForDocument(docForMovements);
      expect(result2.created).toBe(0);

      // Verify only one movement exists
      const movements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id },
      });
      expect(movements).toHaveLength(1);
    });

    it("cancel creates one reversing movement", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);

      // Cancel
      const result = await createReversingMovements(docForMovements.id);

      expect(result.created).toBe(1);

      // Verify reversing movement
      const reversingMovements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id, isReversing: true },
      });
      expect(reversingMovements).toHaveLength(1);
      expect(reversingMovements[0].quantity).toBe(-10);
    });

    it("cancel sets isReversing=true and reversesDocumentId", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);

      await createReversingMovements(docForMovements.id);

      const reversingMovement = await db.stockMovement.findFirst({
        where: { documentId: docForMovements.id, isReversing: true },
      });

      expect(reversingMovement).toBeDefined();
      expect(reversingMovement!.isReversing).toBe(true);
      expect(reversingMovement!.reversesDocumentId).toBe(docForMovements.id);
    });

    it("cancel returns stock to original value", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);

      // Verify stock increased
      let stockRecord = await db.stockRecord.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
      });
      expect(stockRecord!.quantity).toBe(10);

      // Cancel
      await createReversingMovements(docForMovements.id);

      // Verify stock returned to 0
      stockRecord = await db.stockRecord.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
      });
      expect(stockRecord!.quantity).toBe(0);
    });

    it("duplicate cancel is idempotent (no second reversing)", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);

      // First cancel
      const result1 = await createReversingMovements(docForMovements.id);
      expect(result1.created).toBe(1);

      // Second cancel (should be idempotent)
      const result2 = await createReversingMovements(docForMovements.id);
      expect(result2.created).toBe(0);

      // Verify only one reversing movement exists
      const reversingMovements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id, isReversing: true },
      });
      expect(reversingMovements).toHaveLength(1);
    });

    it("StockRecord matches sum of movements", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);
      await createReversingMovements(docForMovements.id);

      // Calculate from movements
      const stockFromMovements = await calculateStockFromMovements(
        product.id,
        warehouse.id
      );

      // Get from StockRecord
      const stockRecord = await db.stockRecord.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
      });

      expect(stockFromMovements).toBe(0);
      expect(stockRecord!.quantity).toBe(0);
      expect(stockFromMovements).toBe(stockRecord!.quantity);
    });
  });

  describe("multiple products", () => {
    it("creates movements for each product", async () => {
      const product2 = await createProduct();

      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [
          { productId: product.id, quantity: 5, price: 100 },
          { productId: product2.id, quantity: 3, price: 200 },
        ]
      );

      const result = await createMovementsForDocument(docForMovements);

      expect(result.created).toBe(2);

      const movements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id },
      });
      expect(movements).toHaveLength(2);
    });

    it("reverses all product movements on cancel", async () => {
      const product2 = await createProduct();

      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [
          { productId: product.id, quantity: 5, price: 100 },
          { productId: product2.id, quantity: 3, price: 200 },
        ]
      );

      await createMovementsForDocument(docForMovements);
      const result = await createReversingMovements(docForMovements.id);

      expect(result.created).toBe(2);

      const reversingMovements = await db.stockMovement.findMany({
        where: { documentId: docForMovements.id, isReversing: true },
      });
      expect(reversingMovements).toHaveLength(2);
    });
  });

  describe("hasReversingMovements", () => {
    it("returns false when no reversing movements exist", async () => {
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
      });

      const result = await hasReversingMovements(doc.id);
      expect(result).toBe(false);
    });

    it("returns true when reversing movements exist", async () => {
      const docForMovements = await createDocForMovements(
        { type: "incoming_shipment", status: "confirmed", warehouseId: warehouse.id },
        [{ productId: product.id, quantity: 10, price: 100 }]
      );
      await createMovementsForDocument(docForMovements);
      await createReversingMovements(docForMovements.id);

      const result = await hasReversingMovements(docForMovements.id);
      expect(result).toBe(true);
    });
  });

  describe("reconcileStockRecord", () => {
    it("syncs StockRecord with movements sum", async () => {
      // Create a document first (required by FK constraint)
      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        warehouseId: warehouse.id,
      });

      // Create movements directly
      await db.stockMovement.create({
        data: {
          documentId: doc.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 15,
          cost: 100,
          totalCost: 1500,
          type: "receipt",
          isReversing: false,
        },
      });

      // Reconcile
      const quantity = await reconcileStockRecord(product.id, warehouse.id);

      expect(quantity).toBe(15);

      const stockRecord = await db.stockRecord.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
      });
      expect(stockRecord!.quantity).toBe(15);
    });
  });
});

// =============================================================
// write_off: confirm → cancel
// =============================================================

describe("StockMovementService — write_off", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product = await createProduct();
  });

  async function setupWriteOff(qty: number, price: number) {
    const doc = await createDocument({
      type: "write_off",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: qty, price });
    const docForMovements: DocumentForMovements = {
      id: doc.id,
      type: doc.type,
      warehouseId: doc.warehouseId,
      targetWarehouseId: null,
      items: [{ productId: product.id, quantity: qty, price }],
    };
    return { doc, docForMovements };
  }

  it("confirm creates one movement with type=write_off", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    const result = await createMovementsForDocument(docForMovements);
    expect(result.created).toBe(1);
    await assertMovementCount(docForMovements.id, 1, false);
    await assertMovementsType(docForMovements.id, "write_off", false);
  });

  it("write_off movement has negative quantity (OUT)", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    await createMovementsForDocument(docForMovements);
    const movements = await db.stockMovement.findMany({
      where: { documentId: docForMovements.id, isReversing: false },
    });
    expect(movements[0].quantity).toBe(-20);
    expect(movements[0].totalCost).toBe(-1000);
  });

  it("duplicate confirm is idempotent", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    await assertIdempotentOperation(
      () => createMovementsForDocument(docForMovements),
      1
    );
    await assertMovementCount(docForMovements.id, 1, false);
  });

  it("cancel creates reversing movement (positive qty, restores stock)", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    await createMovementsForDocument(docForMovements);
    const result = await createReversingMovements(docForMovements.id);
    expect(result.created).toBe(1);
    await assertReversingMovementsNegate(docForMovements.id);
    await assertStockMatchesMovements(warehouse.id, product.id);
  });

  it("duplicate cancel is idempotent", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    await createMovementsForDocument(docForMovements);
    await assertIdempotentOperation(
      () => createReversingMovements(docForMovements.id),
      1
    );
    await assertMovementCount(docForMovements.id, 1, true);
  });

  it("StockRecord matches sum of movements after full cycle", async () => {
    const { docForMovements } = await setupWriteOff(20, 50);
    await createMovementsForDocument(docForMovements);
    await createReversingMovements(docForMovements.id);
    await assertStockMatchesMovements(warehouse.id, product.id);
  });
});

// =============================================================
// stock_transfer: confirm → cancel
// =============================================================

describe("StockMovementService — stock_transfer", () => {
  let sourceWarehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let targetWarehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    sourceWarehouse = await createWarehouse({ name: "Source" });
    targetWarehouse = await createWarehouse({ name: "Target" });
    product = await createProduct();
  });

  async function setupTransfer(qty: number, price: number) {
    const doc = await createDocument({
      type: "stock_transfer",
      status: "confirmed",
      warehouseId: sourceWarehouse.id,
      targetWarehouseId: targetWarehouse.id,
    });
    await createDocumentItem(doc.id, product.id, { quantity: qty, price });
    const docForMovements: DocumentForMovements = {
      id: doc.id,
      type: doc.type,
      warehouseId: doc.warehouseId,
      targetWarehouseId: doc.targetWarehouseId,
      items: [{ productId: product.id, quantity: qty, price }],
    };
    return { doc, docForMovements };
  }

  it("confirm creates two movements: transfer_out and transfer_in", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    const result = await createMovementsForDocument(docForMovements);
    expect(result.created).toBe(2);
    await assertMovementCount(docForMovements.id, 2, false);
    const movements = await db.stockMovement.findMany({
      where: { documentId: docForMovements.id, isReversing: false },
    });
    const types = movements.map((m) => m.type).sort();
    expect(types).toEqual(["transfer_in", "transfer_out"]);
  });

  it("transfer_out is negative qty on source, transfer_in is positive qty on target", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await createMovementsForDocument(docForMovements);
    const outMovement = await db.stockMovement.findFirst({
      where: { documentId: docForMovements.id, type: "transfer_out" },
    });
    const inMovement = await db.stockMovement.findFirst({
      where: { documentId: docForMovements.id, type: "transfer_in" },
    });
    expect(outMovement!.quantity).toBe(-30);
    expect(outMovement!.warehouseId).toBe(sourceWarehouse.id);
    expect(inMovement!.quantity).toBe(30);
    expect(inMovement!.warehouseId).toBe(targetWarehouse.id);
  });

  it("StockRecord: source decreases, target increases — both match movements", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await createMovementsForDocument(docForMovements);
    await assertStockMatchesMovements(sourceWarehouse.id, product.id);
    await assertStockMatchesMovements(targetWarehouse.id, product.id);
  });

  it("duplicate confirm is idempotent (2 movements total)", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await assertIdempotentOperation(
      () => createMovementsForDocument(docForMovements),
      2
    );
    await assertMovementCount(docForMovements.id, 2);
  });

  it("cancel creates 2 reversing movements", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await createMovementsForDocument(docForMovements);
    const result = await createReversingMovements(docForMovements.id);
    expect(result.created).toBe(2);
    await assertMovementCount(docForMovements.id, 2, true);
  });

  it("cancel restores both warehouse stock to net 0", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await createMovementsForDocument(docForMovements);
    await createReversingMovements(docForMovements.id);
    await assertStockMatchesMovements(sourceWarehouse.id, product.id);
    await assertStockMatchesMovements(targetWarehouse.id, product.id);
    const srcQty = await calculateStockFromMovements(product.id, sourceWarehouse.id);
    const tgtQty = await calculateStockFromMovements(product.id, targetWarehouse.id);
    expect(srcQty).toBe(0);
    expect(tgtQty).toBe(0);
  });

  it("duplicate cancel is idempotent", async () => {
    const { docForMovements } = await setupTransfer(30, 100);
    await createMovementsForDocument(docForMovements);
    await assertIdempotentOperation(
      () => createReversingMovements(docForMovements.id),
      2
    );
    await assertMovementCount(docForMovements.id, 2, true);
  });
});

// =============================================================
// getMovementTypeForDocument / documentAffectsStock — pure mapping
// =============================================================

import {
  getMovementTypeForDocument,
  documentAffectsStock,
} from "@/lib/modules/accounting/stock-movements";

describe("getMovementTypeForDocument", () => {
  it.each([
    ["stock_receipt", false, "receipt"],
    ["incoming_shipment", false, "receipt"],
    ["customer_return", false, "receipt"],
    ["write_off", false, "write_off"],
    ["outgoing_shipment", false, "shipment"],
    ["supplier_return", false, "return"],
    ["stock_transfer", false, "transfer_out"],
    ["stock_transfer", true, "transfer_in"],
  ])("%s (isTarget=%s) → %s", (docType, isTarget, expectedType) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getMovementTypeForDocument(docType as any, isTarget as boolean)).toBe(expectedType);
  });

  it.each([
    "purchase_order",
    "sales_order",
    "incoming_payment",
    "outgoing_payment",
  ])("%s returns null (non-stock document)", (docType) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getMovementTypeForDocument(docType as any)).toBeNull();
  });
});

describe("documentAffectsStock", () => {
  it.each([
    "stock_receipt",
    "incoming_shipment",
    "customer_return",
    "write_off",
    "outgoing_shipment",
    "supplier_return",
    "stock_transfer",
  ])("returns true for %s", (docType) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(documentAffectsStock(docType as any)).toBe(true);
  });

  it.each([
    "purchase_order",
    "sales_order",
    "incoming_payment",
    "outgoing_payment",
    "inventory_count",
  ])("returns false for %s", (docType) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(documentAffectsStock(docType as any)).toBe(false);
  });
});

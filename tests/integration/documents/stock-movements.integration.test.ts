/**
 * Stock Movement Integration Tests
 *
 * Validates the full confirm→cancel lifecycle with real DB persistence.
 * Focus: transaction boundaries, idempotency constraints, and the core invariant
 * that StockRecord.quantity always equals the sum of all StockMovements.
 *
 * Requires: DATABASE_URL → listopt_erp_test (see .env.test)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  createMovementsForDocument,
  createReversingMovements,
  hasReversingMovements,
  documentHasMovements,
  calculateStockFromMovements,
  reconcileStockRecord,
  type DocumentForMovements,
} from "@/lib/modules/accounting/inventory/stock-movements";
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
  assertReversingMovementsNegate,
  assertIdempotentOperation,
} from "../../helpers/stock-assertions";

// =============================================
// Helpers
// =============================================

async function buildDocForMovements(
  warehouseId: string,
  type: DocumentForMovements["type"],
  items: Array<{ productId: string; quantity: number; price: number }>,
  targetWarehouseId?: string
): Promise<DocumentForMovements> {
  const doc = await createDocument({
    type,
    status: "confirmed",
    warehouseId,
    targetWarehouseId,
  });
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
    targetWarehouseId: doc.targetWarehouseId ?? null,
    items,
  };
}

// =============================================
// DB persistence: movements are written correctly
// =============================================

describe("StockMovement Integration — DB persistence", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse({ name: "Main Warehouse" });
    product = await createProduct({ name: "Widget A" });
  });

  it("createMovementsForDocument persists movements to DB", async () => {
    const docForMovements = await buildDocForMovements(warehouse.id, "incoming_shipment", [
      { productId: product.id, quantity: 100, price: 50 },
    ]);

    await createMovementsForDocument(docForMovements);

    const movements = await db.stockMovement.findMany({
      where: { documentId: docForMovements.id },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("receipt");
    expect(movements[0].quantity).toBe(100);
    expect(movements[0].cost).toBe(50);
    expect(movements[0].totalCost).toBe(5000);
    expect(movements[0].isReversing).toBe(false);
    expect(movements[0].productId).toBe(product.id);
    expect(movements[0].warehouseId).toBe(warehouse.id);
  });

  it("StockRecord is created / updated atomically with movements", async () => {
    const docForMovements = await buildDocForMovements(warehouse.id, "incoming_shipment", [
      { productId: product.id, quantity: 100, price: 50 },
    ]);

    await createMovementsForDocument(docForMovements);

    await assertStockRecord(warehouse.id, product.id, 100);
    await assertStockMatchesMovements(warehouse.id, product.id);
  });

  it("documentHasMovements returns true after create, false before", async () => {
    const docForMovements = await buildDocForMovements(warehouse.id, "stock_receipt", [
      { productId: product.id, quantity: 10, price: 20 },
    ]);

    expect(await documentHasMovements(docForMovements.id)).toBe(false);
    await createMovementsForDocument(docForMovements);
    expect(await documentHasMovements(docForMovements.id)).toBe(true);
  });
});

// =============================================
// Invariant: StockRecord always == sum(movements)
// =============================================

describe("StockMovement Integration — core invariant: StockRecord == sum(movements)", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product = await createProduct();
  });

  it("holds after multiple receipts", async () => {
    for (const [qty, price] of [[50, 100], [30, 120], [20, 80]] as const) {
      const doc = await buildDocForMovements(warehouse.id, "stock_receipt", [
        { productId: product.id, quantity: qty, price },
      ]);
      await createMovementsForDocument(doc);
    }
    await assertStockMatchesMovements(warehouse.id, product.id);
    await assertStockRecord(warehouse.id, product.id, 100); // 50+30+20
  });

  it("holds after receipt + write_off", async () => {
    const receipt = await buildDocForMovements(warehouse.id, "stock_receipt", [
      { productId: product.id, quantity: 100, price: 50 },
    ]);
    const writeOff = await buildDocForMovements(warehouse.id, "write_off", [
      { productId: product.id, quantity: 30, price: 50 },
    ]);
    await createMovementsForDocument(receipt);
    await createMovementsForDocument(writeOff);

    await assertStockMatchesMovements(warehouse.id, product.id);
    await assertStockRecord(warehouse.id, product.id, 70);
  });

  it("holds after full confirm + cancel cycle", async () => {
    const doc = await buildDocForMovements(warehouse.id, "incoming_shipment", [
      { productId: product.id, quantity: 40, price: 200 },
    ]);
    await createMovementsForDocument(doc);
    await createReversingMovements(doc.id);

    await assertStockMatchesMovements(warehouse.id, product.id);
    await assertStockRecord(warehouse.id, product.id, 0);
  });

  it("holds after multi-product document", async () => {
    const product2 = await createProduct({ name: "Widget B" });
    const doc = await buildDocForMovements(warehouse.id, "stock_receipt", [
      { productId: product.id, quantity: 10, price: 100 },
      { productId: product2.id, quantity: 25, price: 80 },
    ]);
    await createMovementsForDocument(doc);

    await assertStockMatchesMovements(warehouse.id, product.id);
    await assertStockMatchesMovements(warehouse.id, product2.id);
    await assertStockRecord(warehouse.id, product.id, 10);
    await assertStockRecord(warehouse.id, product2.id, 25);
  });
});

// =============================================
// Idempotency constraints
// =============================================

describe("StockMovement Integration — idempotency", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product = await createProduct();
  });

  it("duplicate confirm does not create duplicate movements", async () => {
    const doc = await buildDocForMovements(warehouse.id, "incoming_shipment", [
      { productId: product.id, quantity: 10, price: 100 },
    ]);
    await assertIdempotentOperation(
      () => createMovementsForDocument(doc),
      1
    );
    await assertMovementCount(doc.id, 1, false);
    // Stock should reflect exactly one confirm, not two
    await assertStockRecord(warehouse.id, product.id, 10);
  });

  it("duplicate cancel does not create duplicate reversals", async () => {
    const doc = await buildDocForMovements(warehouse.id, "incoming_shipment", [
      { productId: product.id, quantity: 10, price: 100 },
    ]);
    await createMovementsForDocument(doc);
    await assertIdempotentOperation(
      () => createReversingMovements(doc.id),
      1
    );
    await assertMovementCount(doc.id, 1, true);
    // Stock should be 0, not negative
    await assertStockRecord(warehouse.id, product.id, 0);
  });

  it("hasReversingMovements reflects DB state correctly", async () => {
    const doc = await buildDocForMovements(warehouse.id, "stock_receipt", [
      { productId: product.id, quantity: 5, price: 200 },
    ]);
    await createMovementsForDocument(doc);

    expect(await hasReversingMovements(doc.id)).toBe(false);
    await createReversingMovements(doc.id);
    expect(await hasReversingMovements(doc.id)).toBe(true);
  });
});

// =============================================
// Transfer: two warehouses, net-zero conservation
// =============================================

describe("StockMovement Integration — stock_transfer conservation", () => {
  let source: Awaited<ReturnType<typeof createWarehouse>>;
  let target: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    source = await createWarehouse({ name: "Source" });
    target = await createWarehouse({ name: "Target" });
    product = await createProduct();
  });

  it("total stock across all warehouses is conserved during transfer", async () => {
    // Seed source stock via receipt
    const receipt = await buildDocForMovements(source.id, "stock_receipt", [
      { productId: product.id, quantity: 100, price: 50 },
    ]);
    await createMovementsForDocument(receipt);

    // Transfer 40 units
    const transfer = await buildDocForMovements(
      source.id,
      "stock_transfer",
      [{ productId: product.id, quantity: 40, price: 50 }],
      target.id
    );
    await createMovementsForDocument(transfer);

    const sourceQty = await calculateStockFromMovements(product.id, source.id);
    const targetQty = await calculateStockFromMovements(product.id, target.id);

    expect(sourceQty).toBe(60);  // 100 - 40
    expect(targetQty).toBe(40);  // 0 + 40
    expect(sourceQty + targetQty).toBe(100); // Total conserved

    await assertStockMatchesMovements(source.id, product.id);
    await assertStockMatchesMovements(target.id, product.id);
  });

  it("transfer cancel fully restores both warehouses", async () => {
    const transfer = await buildDocForMovements(
      source.id,
      "stock_transfer",
      [{ productId: product.id, quantity: 40, price: 50 }],
      target.id
    );
    await createMovementsForDocument(transfer);
    await createReversingMovements(transfer.id);

    await assertStockMatchesMovements(source.id, product.id);
    await assertStockMatchesMovements(target.id, product.id);

    const sourceQty = await calculateStockFromMovements(product.id, source.id);
    const targetQty = await calculateStockFromMovements(product.id, target.id);
    expect(sourceQty).toBe(0);
    expect(targetQty).toBe(0);
  });
});

// =============================================
// reconcileStockRecord: repair tool
// =============================================

describe("StockMovement Integration — reconcileStockRecord", () => {
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    await cleanDatabase();
    warehouse = await createWarehouse();
    product = await createProduct();
  });

  it("reconcile repairs a drifted StockRecord", async () => {
    // Create a movement but then manually corrupt the stock record
    const doc = await buildDocForMovements(warehouse.id, "stock_receipt", [
      { productId: product.id, quantity: 100, price: 50 },
    ]);
    await createMovementsForDocument(doc);

    // Corrupt StockRecord
    await db.stockRecord.update({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      data: { quantity: 999 },
    });

    // Reconcile
    const corrected = await reconcileStockRecord(product.id, warehouse.id);
    expect(corrected).toBe(100);
    await assertStockRecord(warehouse.id, product.id, 100);
    await assertStockMatchesMovements(warehouse.id, product.id);
  });

  it("reconcile creates StockRecord if it doesn't exist", async () => {
    // Insert raw movements without going through createMovementsForDocument
    const doc = await createDocument({
      type: "stock_receipt",
      status: "confirmed",
      warehouseId: warehouse.id,
    });
    await db.stockMovement.createMany({
      data: [
        {
          documentId: doc.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 55,
          cost: 100,
          totalCost: 5500,
          type: "receipt",
          isReversing: false,
        },
      ],
    });

    const qty = await reconcileStockRecord(product.id, warehouse.id);
    expect(qty).toBe(55);
    await assertStockRecord(warehouse.id, product.id, 55);
  });
});

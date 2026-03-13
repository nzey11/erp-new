/**
 * Stock Assertion Helpers
 *
 * Reusable assertion utilities for validating stock movement invariants.
 * Use these in any test that touches StockRecord or StockMovement to keep
 * assertions consistent and readable.
 */

import { expect } from "vitest";
import { db } from "@/lib/shared/db";
import { calculateStockFromMovements } from "@/lib/modules/accounting/inventory/stock-movements";

// =============================================
// StockRecord assertions
// =============================================

/**
 * Assert that a StockRecord exists and has the expected quantity.
 */
export async function assertStockRecord(
  warehouseId: string,
  productId: string,
  expectedQty: number
): Promise<void> {
  const record = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  expect(
    record,
    `StockRecord for product ${productId} in warehouse ${warehouseId} should exist`
  ).not.toBeNull();
  expect(
    record!.quantity,
    `StockRecord.quantity should be ${expectedQty}, got ${record!.quantity}`
  ).toBe(expectedQty);
}

/**
 * Assert that StockRecord.quantity equals the sum of all movements.
 * This is the core invariant: the read model must mirror the event log.
 */
export async function assertStockMatchesMovements(
  warehouseId: string,
  productId: string
): Promise<void> {
  const movementSum = await calculateStockFromMovements(productId, warehouseId);
  const record = await db.stockRecord.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  const recordQty = record?.quantity ?? 0;
  expect(
    recordQty,
    `StockRecord.quantity (${recordQty}) must equal sum of movements (${movementSum})`
  ).toBe(movementSum);
}

// =============================================
// Movement count / type assertions
// =============================================

/**
 * Assert the number of movements for a document.
 * Pass isReversing to filter to normal-only or reversing-only movements.
 */
export async function assertMovementCount(
  documentId: string,
  expectedCount: number,
  isReversing?: boolean
): Promise<void> {
  const where =
    isReversing !== undefined
      ? { documentId, isReversing }
      : { documentId };
  const count = await db.stockMovement.count({ where });
  expect(
    count,
    `Expected ${expectedCount} movement(s) for document ${documentId}` +
      (isReversing !== undefined ? ` (isReversing=${isReversing})` : "")
  ).toBe(expectedCount);
}

/**
 * Assert that all non-reversing movements for a document have the expected type.
 */
export async function assertMovementsType(
  documentId: string,
  expectedType: string,
  isReversing = false
): Promise<void> {
  const movements = await db.stockMovement.findMany({
    where: { documentId, isReversing },
  });
  expect(
    movements.length,
    `Expected at least one movement (isReversing=${isReversing}) for document ${documentId}`
  ).toBeGreaterThan(0);
  for (const m of movements) {
    expect(
      m.type,
      `Movement type should be "${expectedType}", got "${m.type}"`
    ).toBe(expectedType);
  }
}

/**
 * Assert that reversing movements mirror the original movements quantity (negated).
 */
export async function assertReversingMovementsNegate(
  documentId: string
): Promise<void> {
  const originals = await db.stockMovement.findMany({
    where: { documentId, isReversing: false },
  });
  const reversals = await db.stockMovement.findMany({
    where: { documentId, isReversing: true },
  });

  expect(originals.length, "originals should exist before checking reversals").toBeGreaterThan(0);
  expect(
    reversals.length,
    "reversals count should equal originals count"
  ).toBe(originals.length);

  for (const orig of originals) {
    const reversal = reversals.find(
      (r) => r.productId === orig.productId && r.warehouseId === orig.warehouseId
    );
    expect(
      reversal,
      `Reversal not found for product ${orig.productId} in warehouse ${orig.warehouseId}`
    ).toBeDefined();
    expect(
      reversal!.quantity,
      `Reversal quantity should be -${orig.quantity}`
    ).toBe(-orig.quantity);
    expect(reversal!.isReversing).toBe(true);
    expect(reversal!.reversesDocumentId).toBe(documentId);
  }
}

// =============================================
// Idempotency assertions
// =============================================

/**
 * Assert that calling an operation twice is idempotent:
 * first call creates `expectedFirstCreated` records,
 * second call creates 0.
 */
export async function assertIdempotentOperation(
  fn: () => Promise<{ created: number }>,
  expectedFirstCreated: number
): Promise<void> {
  const first = await fn();
  expect(
    first.created,
    `First invocation should create ${expectedFirstCreated} item(s)`
  ).toBe(expectedFirstCreated);

  const second = await fn();
  expect(second.created, "Second invocation (idempotent) should create 0 items").toBe(0);
}

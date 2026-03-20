/**
 * Integration tests: ProductCatalogProjection auto-update via outbox.
 *
 * Tests the full flow:
 *   product change → outbox event written → handler invoked → projection updated
 *
 * We drive the handler (onProductCatalogUpdated) directly via claimOutboxEvents +
 * markOutboxProcessed rather than using processOutboxEvents(), to avoid coupling
 * to the global handlerRegistry that other test files may have already populated.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, toNumber } from "@/lib/shared/db";
import { cleanDatabase } from "../../helpers/test-db";
import { createProduct, createUnit, createTenant } from "../../helpers/factories";
import {
  createOutboxEvent,
  markOutboxProcessed,
} from "@/lib/events/outbox";
import { onProductCatalogUpdated } from "@/lib/modules/ecommerce/handlers";
import { updateProductCatalogProjection } from "@/lib/modules/ecommerce/projections";
import type { ProductUpdatedEvent, SalePriceUpdatedEvent, DiscountUpdatedEvent } from "@/lib/events/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an initial projection row for a product by calling the builder directly. */
async function buildInitialProjection(productId: string): Promise<void> {
  await updateProductCatalogProjection(productId);
}

/** Write a product.updated outbox event inside a transaction (mirrors API routes). */
async function emitProductUpdated(productId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await createOutboxEvent(
      tx,
      { type: "product.updated", occurredAt: new Date(), payload: { productId } },
      "Product",
      productId
    );
  });
}

/** Get projection row for a product. Returns null if not found. */
async function getProjection(productId: string) {
  return db.productCatalogProjection.findUnique({ where: { productId } });
}

/**
 * Claim pending outbox events and process them via onProductCatalogUpdated directly.
 * Uses db.outboxEvent.findMany instead of claimOutboxEvents() to avoid
 * relying on $queryRaw which returns snake_case fields with PrismaPg adapter.
 */
async function driveOutbox(limit = 20): Promise<{ processed: number; failed: number }> {
  // Find PENDING events
  const pendingIds = await db.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  if (pendingIds.length === 0) return { processed: 0, failed: 0 };

  await db.outboxEvent.updateMany({
    where: { id: { in: pendingIds.map((e) => e.id) } },
    data: { status: "PROCESSING" },
  });

  const events = await db.outboxEvent.findMany({
    where: { id: { in: pendingIds.map((e) => e.id) } },
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const domainEvent = event.payload as unknown as ProductUpdatedEvent | SalePriceUpdatedEvent | DiscountUpdatedEvent;
      if (
        domainEvent.type === "product.updated" ||
        domainEvent.type === "sale_price.updated" ||
        domainEvent.type === "discount.updated"
      ) {
        await onProductCatalogUpdated(domainEvent);
      }
      await markOutboxProcessed(event.id);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProductCatalogProjection — auto-update via outbox", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("updates when product name changes", async () => {
    // 1. Create product
    const product = await createProduct({ name: "Старое название", publishedToStore: true });

    // 2. Build initial projection
    await buildInitialProjection(product.id);
    const before = await getProjection(product.id);
    expect(before?.name).toBe("Старое название");

    // 3. Update product name in DB
    await db.product.update({ where: { id: product.id }, data: { name: "Новое название" } });

    // 4. Emit outbox event (as API route does atomically)
    await emitProductUpdated(product.id);

    // 5. Process outbox
    const result = await driveOutbox();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // 6. Assert projection has new name
    const after = await getProjection(product.id);
    expect(after?.name).toBe("Новое название");
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("updates when product price changes", async () => {
    const product = await createProduct({ publishedToStore: true });

    // Create initial sale price
    await db.salePrice.create({
      data: { productId: product.id, price: 500, isActive: true },
    });

    await buildInitialProjection(product.id);
    const before = await getProjection(product.id);
    expect(toNumber(before?.price)).toBe(500);

    // Update price: deactivate old, create new — emit event atomically
    await db.$transaction(async (tx) => {
      await tx.salePrice.updateMany({
        where: { productId: product.id, isActive: true },
        data: { isActive: false },
      });
      await tx.salePrice.create({ data: { productId: product.id, price: 750, isActive: true } });
      await createOutboxEvent(
        tx,
        { type: "sale_price.updated", occurredAt: new Date(), payload: { productId: product.id } },
        "SalePrice",
        product.id
      );
    });

    const result = await driveOutbox();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    const after = await getProjection(product.id);
    expect(toNumber(after?.price)).toBe(750);
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("removes projection when product becomes a child variant", async () => {
    const master = await createProduct({ publishedToStore: true });
    const variant = await createProduct({ publishedToStore: true });

    await buildInitialProjection(master.id);
    await buildInitialProjection(variant.id);

    // Both should be in projection initially
    expect(await getProjection(master.id)).not.toBeNull();
    expect(await getProjection(variant.id)).not.toBeNull();

    // Make `variant` a child of `master` (sets masterProductId)
    await db.product.update({
      where: { id: variant.id },
      data: { masterProductId: master.id },
    });

    // Emit product.updated for the variant
    await emitProductUpdated(variant.id);

    const result = await driveOutbox();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Variant should be removed from projection (masterProductId != null → delete)
    expect(await getProjection(variant.id)).toBeNull();
    // Master remains untouched
    expect(await getProjection(master.id)).not.toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("is idempotent — processing the same event twice is safe", async () => {
    const product = await createProduct({ name: "Idempotent", publishedToStore: true });
    await buildInitialProjection(product.id);

    await db.product.update({ where: { id: product.id }, data: { name: "Updated Once" } });

    // Emit same logical change twice (two separate outbox rows)
    await emitProductUpdated(product.id);
    await emitProductUpdated(product.id);

    // Process both events
    const result = await driveOutbox();
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);

    // Projection should have correct final state — no duplicates, no errors
    const proj = await getProjection(product.id);
    expect(proj?.name).toBe("Updated Once");

    // Exactly one projection row
    const count = await db.productCatalogProjection.count({ where: { productId: product.id } });
    expect(count).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("handles bulk update — 5 products all get projection updates", async () => {
    const unit = await createUnit();
    const tenant = await createTenant();

    // Create 5 products with the same tenant
    const products = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createProduct({
          name: `Товар ${i + 1}`,
          unitId: unit.id,
          tenantId: tenant.id,
          publishedToStore: true,
        })
      )
    );

    // Build initial projections
    for (const p of products) {
      await buildInitialProjection(p.id);
    }

    // Update all names and emit events atomically (mirrors bulk route)
    await db.$transaction(async (tx) => {
      for (const p of products) {
        await tx.product.update({
          where: { id: p.id },
          data: { name: `Обновлённый ${p.id.slice(-4)}` },
        });
        await createOutboxEvent(
          tx,
          { type: "product.updated", occurredAt: new Date(), payload: { productId: p.id } },
          "Product",
          p.id
        );
      }
    });

    // Process all 5 events
    const result = await driveOutbox();
    expect(result.processed).toBe(5);
    expect(result.failed).toBe(0);

    // Verify all 5 projections updated
    for (const p of products) {
      const proj = await getProjection(p.id);
      expect(proj).not.toBeNull();
      expect(proj?.name).toBe(`Обновлённый ${p.id.slice(-4)}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("does not error when processing event for deleted product (skip)", async () => {
    const product = await createProduct({ publishedToStore: true });
    await buildInitialProjection(product.id);

    // Hard-delete the product (cascade removes projection row)
    await db.productCatalogProjection.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });

    // Get PostgreSQL NOW() to avoid clock skew between JS and DB
    const [{ now: availableAt }] = await db.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;

    // Insert a stale product.updated event (orphaned)
    await db.outboxEvent.create({
      data: {
        eventType: "product.updated",
        aggregateType: "Product",
        aggregateId: product.id,
        payload: {
          type: "product.updated",
          occurredAt: new Date().toISOString(),
          payload: { productId: product.id },
        },
        status: "PENDING",
        attempts: 0,
        availableAt,
      },
    });

    // Handler should return safely (builder returns action: "skip")
    const result = await driveOutbox();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  it("updates projection when product is soft-deleted (isActive: false)", async () => {
    const product = await createProduct({ publishedToStore: true, isActive: true });
    await buildInitialProjection(product.id);

    const before = await getProjection(product.id);
    expect(before?.isActive).toBe(true);

    // Soft-delete (mirrors DELETE /api/accounting/products/[id])
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { isActive: false } });
      await createOutboxEvent(
        tx,
        { type: "product.updated", occurredAt: new Date(), payload: { productId: product.id } },
        "Product",
        product.id
      );
    });

    const result = await driveOutbox();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Projection row updated with isActive: false (hidden product stays in projection)
    const after = await getProjection(product.id);
    expect(after?.isActive).toBe(false);
  });
});

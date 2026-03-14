/**
 * Backfill Product.tenantId
 *
 * Strategy:
 * 1. Products with StockRecord → Warehouse → tenantId (most reliable)
 * 2. Products with DocumentItem → Document → tenantId (fallback)
 * 3. Remaining products → flag for manual review
 *
 * Usage:
 *   npx tsx scripts/backfill-product-tenant.ts
 *   npx tsx scripts/backfill-product-tenant.ts --dry-run
 */

import { db } from "@/lib/shared/db";

interface BackfillStats {
  total: number;
  stockRecordUpdated: number;
  documentItemUpdated: number;
  unresolved: number;
  crossTenantConflicts: number;
}

async function backfillProductTenantId(dryRun: boolean = false): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    stockRecordUpdated: 0,
    documentItemUpdated: 0,
    unresolved: 0,
    crossTenantConflicts: 0,
  };

  // Count total products
  stats.total = await db.product.count();
  console.log(`Total products: ${stats.total}\n`);

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }

  // Step 1: Products with StockRecord → Warehouse → tenantId
  console.log("Step 1: Backfill via StockRecord → Warehouse");
  console.log("=============================================");

  const stockRecordTenants = await db.$queryRaw<Array<{
    productId: string;
    tenantIds: string[];
  }>>`
    SELECT 
      sr."productId" as "productId",
      ARRAY_AGG(DISTINCT w."tenantId") as "tenantIds"
    FROM "StockRecord" sr
    JOIN "Warehouse" w ON w.id = sr."warehouseId"
    JOIN "Product" p ON p.id = sr."productId"
    WHERE p."tenantId" IS NULL
    GROUP BY sr."productId"
  `;

  // Separate single-tenant and multi-tenant products
  const singleTenantProducts: Array<{ productId: string; tenantId: string }> = [];
  const multiTenantProducts: Array<{ productId: string; tenantIds: string[] }> = [];

  for (const row of stockRecordTenants) {
    if (row.tenantIds.length === 1) {
      singleTenantProducts.push({
        productId: row.productId,
        tenantId: row.tenantIds[0],
      });
    } else {
      multiTenantProducts.push({
        productId: row.productId,
        tenantIds: row.tenantIds,
      });
    }
  }

  console.log(`  Single-tenant products: ${singleTenantProducts.length}`);
  console.log(`  Multi-tenant products (conflicts): ${multiTenantProducts.length}`);

  if (!dryRun && singleTenantProducts.length > 0) {
    // Batch update
    for (const { productId, tenantId } of singleTenantProducts) {
      await db.product.update({
        where: { id: productId },
        data: { tenantId },
      });
    }
    stats.stockRecordUpdated = singleTenantProducts.length;
    console.log(`  ✅ Updated: ${stats.stockRecordUpdated} products`);
  } else if (dryRun) {
    stats.stockRecordUpdated = singleTenantProducts.length;
    console.log(`  Would update: ${stats.stockRecordUpdated} products`);
  }

  stats.crossTenantConflicts = multiTenantProducts.length;

  if (multiTenantProducts.length > 0) {
    console.log("\n  ⚠️ Cross-tenant products (first 10):");
    for (const item of multiTenantProducts.slice(0, 10)) {
      console.log(`    Product ${item.productId}: tenants [${item.tenantIds.join(", ")}]`);
    }
  }
  console.log("");

  // Step 2: Products with DocumentItem → Document → tenantId (fallback)
  console.log("Step 2: Backfill via DocumentItem → Document");
  console.log("=============================================");

  const documentItemTenants = await db.$queryRaw<Array<{
    productId: string;
    tenantIds: string[];
  }>>`
    SELECT 
      di."productId" as "productId",
      ARRAY_AGG(DISTINCT d."tenantId") as "tenantIds"
    FROM "DocumentItem" di
    JOIN "Document" d ON d.id = di."documentId"
    JOIN "Product" p ON p.id = di."productId"
    WHERE p."tenantId" IS NULL
      AND d."tenantId" IS NOT NULL
    GROUP BY di."productId"
  `;

  const singleTenantDocProducts: Array<{ productId: string; tenantId: string }> = [];
  const multiTenantDocProducts: Array<{ productId: string; tenantIds: string[] }> = [];

  for (const row of documentItemTenants) {
    if (row.tenantIds.length === 1) {
      singleTenantDocProducts.push({
        productId: row.productId,
        tenantId: row.tenantIds[0],
      });
    } else {
      multiTenantDocProducts.push({
        productId: row.productId,
        tenantIds: row.tenantIds,
      });
    }
  }

  console.log(`  Single-tenant products: ${singleTenantDocProducts.length}`);
  console.log(`  Multi-tenant products (conflicts): ${multiTenantDocProducts.length}`);

  if (!dryRun && singleTenantDocProducts.length > 0) {
    for (const { productId, tenantId } of singleTenantDocProducts) {
      await db.product.update({
        where: { id: productId },
        data: { tenantId },
      });
    }
    stats.documentItemUpdated = singleTenantDocProducts.length;
    console.log(`  ✅ Updated: ${stats.documentItemUpdated} products`);
  } else if (dryRun) {
    stats.documentItemUpdated = singleTenantDocProducts.length;
    console.log(`  Would update: ${stats.documentItemUpdated} products`);
  }

  stats.crossTenantConflicts += multiTenantDocProducts.length;

  if (multiTenantDocProducts.length > 0) {
    console.log("\n  ⚠️ Cross-tenant products (first 10):");
    for (const item of multiTenantDocProducts.slice(0, 10)) {
      console.log(`    Product ${item.productId}: tenants [${item.tenantIds.join(", ")}]`);
    }
  }
  console.log("");

  // Step 3: Count unresolved
  console.log("Step 3: Counting unresolved products");
  console.log("=====================================");

  const unresolvedCount = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Product"
    WHERE "tenantId" IS NULL
  `;
  stats.unresolved = Number(unresolvedCount[0].count);
  console.log(`  Unresolved: ${stats.unresolved} products\n`);

  // Step 4: Report unresolved products
  if (stats.unresolved > 0) {
    console.log("=== Unresolved Products Report ===\n");

    const unresolved = await db.$queryRaw<Array<{
      id: string;
      name: string;
      sku: string | null;
      hasStock: boolean;
      hasDocuments: boolean;
    }>>`
      SELECT 
        p.id,
        p.name,
        p.sku,
        EXISTS(SELECT 1 FROM "StockRecord" sr WHERE sr."productId" = p.id) as "hasStock",
        EXISTS(SELECT 1 FROM "DocumentItem" di WHERE di."productId" = p.id) as "hasDocuments"
      FROM "Product" p
      WHERE p."tenantId" IS NULL
      ORDER BY p.name
      LIMIT 50
    `;

    console.log("Products requiring manual review (first 50):");
    console.log("--------------------------------------------");
    for (const product of unresolved) {
      console.log(`ID: ${product.id}`);
      console.log(`  Name: ${product.name}`);
      console.log(`  SKU: ${product.sku ?? "none"}`);
      console.log(`  Has stock: ${product.hasStock}`);
      console.log(`  Has documents: ${product.hasDocuments}`);
      console.log("");
    }
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Total products: ${stats.total}`);
  console.log(`Updated via StockRecord: ${stats.stockRecordUpdated}`);
  console.log(`Updated via DocumentItem: ${stats.documentItemUpdated}`);
  console.log(`Cross-tenant conflicts: ${stats.crossTenantConflicts}`);
  console.log(`Unresolved: ${stats.unresolved}`);
  const coveragePct = stats.total > 0
    ? ((stats.total - stats.unresolved) / stats.total) * 100
    : 100;
  console.log(`Coverage: ${coveragePct.toFixed(1)}%`);

  if (dryRun) {
    console.log("\n⚠️ DRY RUN: No changes were made to the database.");
  }

  return stats;
}

// CLI entry point
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

backfillProductTenantId(dryRun)
  .then((stats) => {
    if (stats.unresolved > 0 || stats.crossTenantConflicts > 0) {
      console.log(
        "\n⚠️ Action required: Review unresolved and cross-tenant products."
      );
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => {
    db.$disconnect();
  });

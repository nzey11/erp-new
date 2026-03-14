/**
 * Verification Gate for Product.tenantId Phase 4
 *
 * This script verifies that all preconditions are met before making
 * Product.tenantId required with FK constraint.
 *
 * Gates:
 * 1. No NULL tenantId values in Product table
 * 2. No cross-tenant SKU conflicts (same SKU in different tenants)
 * 3. Coverage check: all products have tenantId
 *
 * Usage:
 *   npx tsx scripts/verify-product-tenant-gate.ts
 *
 * Exit codes:
 *   0 - All gates passed
 *   1 - One or more gates failed
 */

import { db } from "@/lib/shared/db";

interface GateResult {
  name: string;
  passed: boolean;
  count: number;
  expected: number | string;
  message: string;
}

async function verifyProductTenantGate(): Promise<GateResult[]> {
  const results: GateResult[] = [];

  console.log("=== Product.tenantId Verification Gate ===\n");

  // Gate 1: No NULL tenantId
  console.log("Gate 1: Checking for NULL tenantId values...");
  const nullCount = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Product"
    WHERE "tenantId" IS NULL
  `;
  const nullCountNum = Number(nullCount[0].count);

  results.push({
    name: "NULL tenantId check",
    passed: nullCountNum === 0,
    count: nullCountNum,
    expected: 0,
    message: nullCountNum === 0
      ? "✅ PASS: No products with NULL tenantId"
      : `❌ FAIL: ${nullCountNum} products have NULL tenantId`,
  });
  console.log(`  ${results[0].message}\n`);

  // Gate 2: No cross-tenant SKU conflicts
  console.log("Gate 2: Checking for cross-tenant SKU conflicts...");
  const skuConflicts = await db.$queryRaw<Array<{
    sku: string;
    tenantCount: bigint;
    tenants: string;
  }>>`
    SELECT 
      sku,
      COUNT(DISTINCT "tenantId") as "tenantCount",
      STRING_AGG(DISTINCT "tenantId", ', ') as tenants
    FROM "Product"
    WHERE sku IS NOT NULL
      AND "tenantId" IS NOT NULL
    GROUP BY sku
    HAVING COUNT(DISTINCT "tenantId") > 1
  `;

  const conflictCount = skuConflicts.length;

  results.push({
    name: "Cross-tenant SKU conflict check",
    passed: conflictCount === 0,
    count: conflictCount,
    expected: 0,
    message: conflictCount === 0
      ? "✅ PASS: No SKU conflicts across tenants"
      : `❌ FAIL: ${conflictCount} SKUs exist in multiple tenants`,
  });
  console.log(`  ${results[1].message}\n`);

  if (skuConflicts.length > 0) {
    console.log("  SKU conflicts (first 10):");
    for (const conflict of skuConflicts.slice(0, 10)) {
      console.log(`    SKU "${conflict.sku}": tenants [${conflict.tenants}]`);
    }
    console.log("");
  }

  // Gate 3: Coverage check
  console.log("Gate 3: Checking tenantId coverage...");
  const coverage = await db.$queryRaw<[{ total: bigint; with_tenant: bigint }]>`
    SELECT
      COUNT(*) as total,
      COUNT("tenantId") as with_tenant
    FROM "Product"
  `;
  const total = Number(coverage[0].total);
  const withTenant = Number(coverage[0].with_tenant);
  const coveragePct = total > 0 ? ((withTenant / total) * 100).toFixed(2) : "100.00";

  results.push({
    name: "TenantId coverage",
    passed: withTenant === total,
    count: withTenant,
    expected: total,
    message: withTenant === total
      ? `✅ PASS: 100% coverage (${withTenant}/${total} products)`
      : `❌ FAIL: ${coveragePct}% coverage (${withTenant}/${total} products)`,
  });
  console.log(`  ${results[2].message}\n`);

  return results;
}

// CLI entry point
async function main() {
  try {
    const results = await verifyProductTenantGate();

    console.log("=== Summary ===");
    for (const result of results) {
      console.log(`  ${result.message}`);
    }

    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log("\n✅ All gates passed. Ready for Phase 4 schema change.");
      console.log("\nNext steps:");
      console.log("  1. Make tenantId required in schema");
      console.log("  2. Run prisma db push");
      console.log("  3. (Separate step) Change SKU to tenant-scoped uniqueness");
      process.exit(0);
    } else {
      console.log("\n❌ One or more gates failed. Fix issues before proceeding.");
      console.log("\nAction items:");

      if (!results[0].passed) {
        console.log("  1. Run backfill script: npx tsx scripts/backfill-product-tenant.ts");
      }
      if (!results[1].passed) {
        console.log("  2. Resolve SKU conflicts: rename or merge products with same SKU in different tenants");
      }
      if (!results[2].passed) {
        console.log("  3. Ensure all products have tenantId assigned");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error("Verification failed with error:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

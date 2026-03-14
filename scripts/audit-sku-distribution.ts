/**
 * Audit SKU Distribution for Tenant-Scoped Uniqueness Migration
 *
 * This script analyzes the current state of SKU data before migrating
 * from global uniqueness to tenant-scoped uniqueness.
 *
 * Checks:
 * 1. Products with NULL SKU
 * 2. Products with empty SKU
 * 3. SKU duplicates within same tenant (will fail new constraint)
 * 4. SKU duplicates across different tenants (acceptable)
 * 5. SKU format analysis
 *
 * Usage:
 *   npx tsx scripts/audit-sku-distribution.ts
 */

import { db } from "@/lib/shared/db";

interface AuditResult {
  totalProducts: number;
  nullSku: number;
  emptySku: number;
  duplicatesWithinTenant: Array<{
    tenantId: string;
    sku: string;
    count: number;
    productIds: string[];
  }>;
  duplicatesAcrossTenants: Array<{
    sku: string;
    tenantCount: number;
    tenants: string[];
    totalCount: number;
  }>;
  skuFormatStats: {
    withPrefix: number;
    numericOnly: number;
    alphanumeric: number;
    other: number;
  };
}

async function auditSkuDistribution(): Promise<AuditResult> {
  console.log("=== SKU Distribution Audit ===\n");

  // 1. Total products
  const totalProducts = await db.product.count();
  console.log(`Total products: ${totalProducts}`);

  // 2. NULL SKU count
  const nullSku = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Product"
    WHERE sku IS NULL
  `;
  const nullSkuCount = Number(nullSku[0].count);
  console.log(`Products with NULL SKU: ${nullSkuCount}`);

  // 3. Empty SKU count
  const emptySku = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Product"
    WHERE sku = ''
  `;
  const emptySkuCount = Number(emptySku[0].count);
  console.log(`Products with empty SKU: ${emptySkuCount}`);

  // 4. Duplicates within same tenant (CRITICAL - will fail new constraint)
  console.log("\n--- Checking duplicates within same tenant ---");
  const withinTenantDups = await db.$queryRaw<Array<{
    tenantId: string;
    sku: string;
    count: bigint;
    productIds: string;
  }>>`
    SELECT 
      "tenantId",
      sku,
      COUNT(*) as count,
      STRING_AGG(id, ', ') as "productIds"
    FROM "Product"
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY "tenantId", sku
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;

  const duplicatesWithinTenant = withinTenantDups.map((row) => ({
    tenantId: row.tenantId,
    sku: row.sku,
    count: Number(row.count),
    productIds: row.productIds.split(", "),
  }));

  console.log(`  Found ${duplicatesWithinTenant.length} SKUs duplicated within same tenant`);
  if (duplicatesWithinTenant.length > 0) {
    console.log("  ⚠️  CRITICAL: These will FAIL the new tenant-scoped unique constraint!");
    console.log("  First 10:");
    for (const dup of duplicatesWithinTenant.slice(0, 10)) {
      console.log(`    SKU "${dup.sku}" in tenant ${dup.tenantId}: ${dup.count} products`);
    }
  }

  // 5. Duplicates across tenants (acceptable, will be allowed)
  console.log("\n--- Checking duplicates across tenants ---");
  const acrossTenantDups = await db.$queryRaw<Array<{
    sku: string;
    tenantCount: bigint;
    tenants: string;
    totalCount: bigint;
  }>>`
    SELECT 
      sku,
      COUNT(DISTINCT "tenantId") as "tenantCount",
      STRING_AGG(DISTINCT "tenantId", ', ') as tenants,
      COUNT(*) as "totalCount"
    FROM "Product"
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY sku
    HAVING COUNT(DISTINCT "tenantId") > 1
    ORDER BY "tenantCount" DESC, "totalCount" DESC
  `;

  const duplicatesAcrossTenants = acrossTenantDups.map((row) => ({
    sku: row.sku,
    tenantCount: Number(row.tenantCount),
    tenants: row.tenants.split(", "),
    totalCount: Number(row.totalCount),
  }));

  console.log(`  Found ${duplicatesAcrossTenants.length} SKUs existing in multiple tenants`);
  if (duplicatesAcrossTenants.length > 0) {
    console.log("  ✅ These are ACCEPTABLE - tenant-scoped uniqueness allows same SKU in different tenants");
    console.log("  First 5:");
    for (const dup of duplicatesAcrossTenants.slice(0, 5)) {
      console.log(`    SKU "${dup.sku}": ${dup.tenantCount} tenants, ${dup.totalCount} total products`);
    }
  }

  // 6. SKU format analysis
  console.log("\n--- SKU format analysis ---");
  const allSkus = await db.$queryRaw<Array<{ sku: string }>>`
    SELECT sku
    FROM "Product"
    WHERE sku IS NOT NULL AND sku != ''
  `;

  let withPrefix = 0; // SKU-XXXXXX
  let numericOnly = 0; // 12345
  let alphanumeric = 0; // ABC123
  let other = 0;

  for (const row of allSkus) {
    const sku = row.sku;
    if (/^[A-Z]{2,4}-\d+$/.test(sku)) {
      withPrefix++;
    } else if (/^\d+$/.test(sku)) {
      numericOnly++;
    } else if (/^[A-Z0-9-]+$/.test(sku)) {
      alphanumeric++;
    } else {
      other++;
    }
  }

  console.log(`  With prefix (SKU-XXXXXX): ${withPrefix}`);
  console.log(`  Numeric only: ${numericOnly}`);
  console.log(`  Alphanumeric: ${alphanumeric}`);
  console.log(`  Other format: ${other}`);

  return {
    totalProducts,
    nullSku: nullSkuCount,
    emptySku: emptySkuCount,
    duplicatesWithinTenant,
    duplicatesAcrossTenants,
    skuFormatStats: {
      withPrefix,
      numericOnly,
      alphanumeric,
      other,
    },
  };
}

// CLI entry point
async function main() {
  try {
    const result = await auditSkuDistribution();

    console.log("\n=== Summary ===");
    console.log(`Total products: ${result.totalProducts}`);
    console.log(`NULL SKU: ${result.nullSku}`);
    console.log(`Empty SKU: ${result.emptySku}`);
    console.log(`Within-tenant duplicates: ${result.duplicatesWithinTenant.length}`);
    console.log(`Cross-tenant duplicates: ${result.duplicatesAcrossTenants.length}`);

    // Decision
    if (result.duplicatesWithinTenant.length > 0) {
      console.log("\n❌ BLOCKING: Cannot proceed with tenant-scoped SKU uniqueness.");
      console.log("   There are SKUs duplicated within the same tenant.");
      console.log("   These must be resolved before changing the unique constraint.");
      console.log("\nResolution options:");
      console.log("  1. Rename duplicate SKUs (add suffix)");
      console.log("  2. Merge duplicate products");
      console.log("  3. Set SKU to NULL for duplicates");
      process.exit(1);
    } else {
      console.log("\n✅ READY: No within-tenant SKU duplicates found.");
      console.log("   Safe to proceed with tenant-scoped uniqueness migration.");
      process.exit(0);
    }
  } catch (error) {
    console.error("Audit failed:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

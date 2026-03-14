/**
 * Backfill ProductVariant.tenantId from parent Product
 *
 * Phase 2 of ProductVariant tenant-scoped migration.
 *
 * Strategy:
 * 1. Check for orphaned variants (variants without parent Product) - abort if found
 * 2. Backfill tenantId from Product.tenantId via productId FK
 *
 * Usage:
 *   npx tsx scripts/backfill-product-variant-tenant.ts
 */

import { db } from "@/lib/shared/db";

async function main() {
  console.log("=== ProductVariant.tenantId Backfill ===\n");

  // Step 1: Check for orphaned variants
  console.log("Step 1: Checking for orphaned variants...");
  const orphanedVariants = await db.$queryRaw<{ id: string; productId: string }[]>`
    SELECT pv.id, pv."productId"
    FROM "ProductVariant" pv
    LEFT JOIN "Product" p ON pv."productId" = p.id
    WHERE p.id IS NULL
  `;

  if (orphanedVariants.length > 0) {
    console.error(`\n❌ ABORT: Found ${orphanedVariants.length} orphaned variant(s) without parent Product:`);
    orphanedVariants.forEach(v => {
      console.error(`   - Variant ${v.id} references missing Product ${v.productId}`);
    });
    console.error("\nThese records indicate data corruption. Manual cleanup required before migration.");
    process.exit(1);
  }
  console.log("✓ No orphaned variants found.\n");

  // Step 2: Count variants needing backfill
  console.log("Step 2: Counting variants needing backfill...");
  const variantsWithoutTenant = await db.productVariant.count({
    where: { tenantId: { equals: null as unknown as string } },
  });
  const totalVariants = await db.productVariant.count();
  console.log(`  Total variants: ${totalVariants}`);
  console.log(`  Variants without tenantId: ${variantsWithoutTenant}`);

  if (variantsWithoutTenant === 0) {
    console.log("\n✓ All variants already have tenantId. Nothing to backfill.");
    return;
  }

  // Step 3: Backfill tenantId from parent Product
  console.log("\nStep 3: Backfilling tenantId from parent Product...");
  const result = await db.$executeRaw`
    UPDATE "ProductVariant" pv
    SET "tenantId" = p."tenantId"
    FROM "Product" p
    WHERE pv."productId" = p.id
      AND pv."tenantId" IS NULL
  `;
  console.log(`✓ Updated ${result} variant(s).\n`);

  // Step 4: Verify 100% coverage
  console.log("Step 4: Verifying backfill coverage...");
  const remainingWithoutTenant = await db.productVariant.count({
    where: { tenantId: { equals: null as unknown as string } },
  });

  if (remainingWithoutTenant > 0) {
    console.error(`❌ ERROR: ${remainingWithoutTenant} variant(s) still have null tenantId after backfill.`);
    process.exit(1);
  }

  const stats = await db.$queryRaw<{ tenantId: string; count: bigint }[]>`
    SELECT "tenantId", COUNT(*) as count
    FROM "ProductVariant"
    WHERE "tenantId" IS NOT NULL
    GROUP BY "tenantId"
    ORDER BY count DESC
  `;

  console.log("✓ Backfill complete. Distribution by tenant:");
  stats.forEach(s => {
    console.log(`   - Tenant ${s.tenantId}: ${s.count} variant(s)`);
  });

  console.log("\n=== Backfill Complete ===");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

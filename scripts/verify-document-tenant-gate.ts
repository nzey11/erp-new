/**
 * Verification Gate for Document.tenantId Phase 4
 *
 * This script verifies that all preconditions are met before making
 * Document.tenantId required with FK constraint.
 *
 * Gates:
 * 1. No NULL tenantId values in Document table
 * 2. No tenant mismatch between Document and Warehouse
 * 3. Coverage check: all documents have tenantId
 *
 * Usage:
 *   npx tsx scripts/verify-document-tenant-gate.ts
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

async function verifyDocumentTenantGate(): Promise<GateResult[]> {
  const results: GateResult[] = [];

  console.log("=== Document.tenantId Verification Gate ===\n");

  // Gate 1: No NULL tenantId
  console.log("Gate 1: Checking for NULL tenantId values...");
  const nullCount = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Document"
    WHERE "tenantId" IS NULL
  `;
  const nullCountNum = Number(nullCount[0].count);
  
  results.push({
    name: "NULL tenantId check",
    passed: nullCountNum === 0,
    count: nullCountNum,
    expected: 0,
    message: nullCountNum === 0
      ? "✅ PASS: No documents with NULL tenantId"
      : `❌ FAIL: ${nullCountNum} documents have NULL tenantId`,
  });
  console.log(`  ${results[0].message}\n`);

  // Gate 2: No tenant mismatch with Warehouse
  console.log("Gate 2: Checking tenant consistency with Warehouse...");
  const warehouseMismatch = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Document" d
    JOIN "Warehouse" w ON d."warehouseId" = w.id
    WHERE d."tenantId" IS NOT NULL
      AND w."tenantId" IS NOT NULL
      AND d."tenantId" != w."tenantId"
  `;
  const mismatchCount = Number(warehouseMismatch[0].count);
  
  results.push({
    name: "Warehouse tenant consistency",
    passed: mismatchCount === 0,
    count: mismatchCount,
    expected: 0,
    message: mismatchCount === 0
      ? "✅ PASS: All documents match their warehouse tenant"
      : `❌ FAIL: ${mismatchCount} documents have tenant mismatch with warehouse`,
  });
  console.log(`  ${results[1].message}\n`);

  // Gate 3: Coverage check
  console.log("Gate 3: Checking tenantId coverage...");
  const coverage = await db.$queryRaw<[{ total: bigint; with_tenant: bigint }]>`
    SELECT 
      COUNT(*) as total,
      COUNT("tenantId") as with_tenant
    FROM "Document"
  `;
  const total = Number(coverage[0].total);
  const withTenant = Number(coverage[0].with_tenant);
  const coveragePct = total > 0 ? ((withTenant / total) * 100).toFixed(2) : "0.00";
  
  results.push({
    name: "TenantId coverage",
    passed: withTenant === total,
    count: withTenant,
    expected: total,
    message: withTenant === total
      ? `✅ PASS: 100% coverage (${withTenant}/${total} documents)`
      : `❌ FAIL: ${coveragePct}% coverage (${withTenant}/${total} documents)`,
  });
  console.log(`  ${results[2].message}\n`);

  return results;
}

// CLI entry point
async function main() {
  try {
    const results = await verifyDocumentTenantGate();

    console.log("=== Summary ===");
    for (const result of results) {
      console.log(`  ${result.message}`);
    }

    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log("\n✅ All gates passed. Ready for Phase 4 schema change.");
      process.exit(0);
    } else {
      console.log("\n❌ One or more gates failed. Fix issues before proceeding.");
      console.log("\nAction items:");
      
      if (!results[0].passed) {
        console.log("  1. Run backfill script: npx tsx scripts/backfill-document-tenant.ts");
      }
      if (!results[1].passed) {
        console.log("  2. Investigate tenant mismatch documents and fix manually");
      }
      if (!results[2].passed) {
        console.log("  3. Ensure all documents have tenantId assigned");
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

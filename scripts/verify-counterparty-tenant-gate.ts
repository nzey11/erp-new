/**
 * Verification Gate for Counterparty.tenantId (P4-09)
 *
 * Verifies all preconditions are met before adding NOT NULL constraint
 * to Counterparty.tenantId.
 *
 * Gates:
 * 1. No NULL tenantId values in Counterparty table
 * 2. All tenantId values reference valid Tenant rows (FK integrity)
 * 3. Coverage check: 100% of counterparties have tenantId
 *
 * Usage:
 *   npx tsx scripts/verify-counterparty-tenant-gate.ts
 *
 * Exit codes:
 *   0 — All gates passed (ready for NOT NULL migration)
 *   1 — One or more gates failed
 *
 * See: .qoder/specs/erp-normalization-roadmap.md P4-09
 */

import { db } from "@/lib/shared/db";

interface GateResult {
  name: string;
  passed: boolean;
  count: number;
  expected: number | string;
  message: string;
}

async function verifyCounterpartyTenantGate(): Promise<GateResult[]> {
  const results: GateResult[] = [];

  console.log("=== Counterparty.tenantId Verification Gate (P4-09) ===\n");

  // Gate 1: No NULL tenantId
  console.log("Gate 1: Checking for NULL tenantId values...");
  const nullCount = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Counterparty"
    WHERE "tenantId" IS NULL
  `;
  const nullCountNum = Number(nullCount[0].count);

  results.push({
    name: "NULL tenantId check",
    passed: nullCountNum === 0,
    count: nullCountNum,
    expected: 0,
    message:
      nullCountNum === 0
        ? "✅ PASS: No counterparties with NULL tenantId"
        : `❌ FAIL: ${nullCountNum} counterparties have NULL tenantId`,
  });
  console.log(`  ${results[0].message}\n`);

  // Gate 2: All tenantId values reference valid Tenant rows
  console.log("Gate 2: Checking FK integrity (all tenantId → valid Tenant)...");
  const invalidRefs = await db.$queryRaw<Array<{ counterpartyId: string; tenantId: string }>>`
    SELECT c.id as "counterpartyId", c."tenantId"
    FROM "Counterparty" c
    LEFT JOIN "Tenant" t ON c."tenantId" = t.id
    WHERE c."tenantId" IS NOT NULL
      AND t.id IS NULL
  `;

  const invalidCount = invalidRefs.length;

  results.push({
    name: "FK integrity check",
    passed: invalidCount === 0,
    count: invalidCount,
    expected: 0,
    message:
      invalidCount === 0
        ? "✅ PASS: All tenantId values reference valid Tenant rows"
        : `❌ FAIL: ${invalidCount} counterparties reference non-existent tenants`,
  });
  console.log(`  ${results[1].message}\n`);

  if (invalidRefs.length > 0) {
    console.log("  First 5 invalid references:");
    for (const ref of invalidRefs.slice(0, 5)) {
      console.log(`    Counterparty ${ref.counterpartyId} → tenantId ${ref.tenantId} (not found)`);
    }
    console.log("");
  }

  // Gate 3: Coverage check (100%)
  console.log("Gate 3: Checking tenantId coverage...");
  const coverage = await db.$queryRaw<[{ total: bigint; with_tenant: bigint }]>`
    SELECT
      COUNT(*) as total,
      COUNT("tenantId") as with_tenant
    FROM "Counterparty"
  `;
  const total = Number(coverage[0].total);
  const withTenant = Number(coverage[0].with_tenant);
  const coveragePct = total > 0 ? ((withTenant / total) * 100).toFixed(2) : "100.00";

  results.push({
    name: "TenantId coverage",
    passed: withTenant === total,
    count: withTenant,
    expected: total,
    message:
      withTenant === total
        ? `✅ PASS: 100% coverage (${withTenant}/${total} counterparties)`
        : `❌ FAIL: ${coveragePct}% coverage (${withTenant}/${total} counterparties)`,
  });
  console.log(`  ${results[2].message}\n`);

  return results;
}

async function main() {
  try {
    const results = await verifyCounterpartyTenantGate();

    console.log("=== Summary ===");
    for (const result of results) {
      console.log(`  ${result.message}`);
    }

    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log(
        "\n✅ All gates passed. Ready to apply NOT NULL constraint (migration 20260314_add_counterparty_tenant_not_null)."
      );
      console.log("\nNext step:");
      console.log("  npx prisma db push  (to apply schema.prisma with tenantId String required)");
      process.exit(0);
    } else {
      console.log(
        "\n❌ One or more gates failed. Fix issues before adding NOT NULL constraint."
      );
      console.log("\nAction items:");
      if (!results[0].passed) {
        console.log(
          "  1. Run backfill: npx tsx scripts/backfill-counterparty-tenant.ts"
        );
      }
      if (!results[1].passed) {
        console.log(
          "  2. Fix invalid tenantId references (point to a valid Tenant.id)"
        );
      }
      if (!results[2].passed) {
        console.log(
          "  3. Ensure all counterparties have tenantId assigned"
        );
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

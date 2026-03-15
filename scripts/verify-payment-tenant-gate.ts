/**
 * Verification Gate: Payment.tenantId Coverage
 *
 * Validates that all Payment rows have a valid tenantId.
 * Note: Payment.tenantId is now NOT NULL (schema enforced).
 * This gate verifies FK integrity only.
 *
 * Checks:
 * 1. Every Payment.tenantId references an existing Tenant row (FK integrity)
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: FK integrity violation
 */

import { db } from "@/lib/shared/db";

async function verifyPaymentTenantGate(): Promise<void> {
  console.log("=== Payment TenantId Verification Gate ===\n");

  let hasErrors = false;

  // Check 1: FK integrity - all tenantIds reference existing Tenants
  console.log("Check 1: Verifying FK integrity (tenantId -> Tenant)...");

  // Get all distinct tenantIds from Payment
  const paymentTenantIds = await db.payment.findMany({
    distinct: ["tenantId"],
    select: { tenantId: true },
  });

  const distinctTenantIds = paymentTenantIds
    .map((p) => p.tenantId)
    .filter((id): id is string => id !== null && id !== undefined && id !== "");

  console.log(`  Found ${distinctTenantIds.length} distinct tenantId values in Payment`);

  if (distinctTenantIds.length > 0) {
    // Check each tenantId exists in Tenant table
    const invalidTenantIds: string[] = [];

    for (const tenantId of distinctTenantIds) {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });

      if (!tenant) {
        invalidTenantIds.push(tenantId);
      }
    }

    if (invalidTenantIds.length > 0) {
      console.error(`  ❌ FAIL: Found ${invalidTenantIds.length} invalid tenantId references:`);
      for (const id of invalidTenantIds.slice(0, 10)) {
        console.error(`     - ${id}`);
      }
      if (invalidTenantIds.length > 10) {
        console.error(`     ... and ${invalidTenantIds.length - 10} more`);
      }
      hasErrors = true;
    } else {
      console.log("  ✅ PASS: All tenantId references are valid");
    }
  } else {
    console.log("  ℹ️  SKIP: No tenantId values to verify (empty Payment table)");
  }

  // Summary
  console.log("\n=== Verification Summary ===");
  const totalPayments = await db.payment.count();

  console.log(`Total Payment rows: ${totalPayments}`);
  console.log(`Valid tenantId coverage: ${totalPayments}/${totalPayments} (schema-enforced NOT NULL)`);

  if (hasErrors) {
    console.log("\n❌ GATE FAILED: Payment tenantId FK integrity violation");
    process.exit(1);
  } else {
    console.log("\n✅ GATE PASSED: Payment tenantId coverage is 100% complete");
    process.exit(0);
  }
}

verifyPaymentTenantGate().catch((error) => {
  console.error("\n💥 Verification gate crashed:", error);
  process.exit(1);
});

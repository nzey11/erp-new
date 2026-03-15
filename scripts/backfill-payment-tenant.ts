/**
 * Backfill script for Payment.tenantId
 *
 * NOTE: This script was used during Phase 5A migration when Payment.tenantId
 * was nullable. After 5A-PAY-05, the column is NOT NULL schema-enforced.
 *
 * This script now serves as a no-op idempotent check that verifies
 * all Payment rows have valid tenantId values.
 */

import { db } from "@/lib/shared/db";

async function backfillPaymentTenant() {
  console.log("Payment.tenantId backfill check (schema is now NOT NULL)...");

  // Get initial stats
  const totalPayments = await db.payment.count();

  console.log(`Total Payment rows: ${totalPayments}`);
  console.log("Note: Payment.tenantId is schema-enforced NOT NULL since 5A-PAY-05");

  // Since tenantId is NOT NULL, we can only verify FK integrity
  console.log("\nVerifying FK integrity...");

  const paymentsWithInvalidTenant = await db.payment.findMany({
    where: {
      tenant: null,
    },
    select: {
      id: true,
      tenantId: true,
    },
  });

  if (paymentsWithInvalidTenant.length > 0) {
    console.error(`ERROR: Found ${paymentsWithInvalidTenant.length} payments with invalid tenantId references:`);
    for (const p of paymentsWithInvalidTenant.slice(0, 10)) {
      console.error(`  - Payment ${p.id}: tenantId=${p.tenantId}`);
    }
    process.exit(1);
  }

  console.log("✅ All Payment rows have valid tenantId (schema-enforced NOT NULL)");

  return {
    updated: 0,
    byDocument: 0,
    byCounterparty: 0,
    byFallback: 0,
    unresolved: 0,
  };
}

backfillPaymentTenant()
  .then((result) => {
    console.log("\nBackfill check result:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill check failed:", error);
    process.exit(1);
  });

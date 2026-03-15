/**
 * Backfill Payment.tenantId
 *
 * Resolution order:
 * 1. Payment.documentId -> Document.tenantId
 * 2. Payment.counterpartyId -> Counterparty.tenantId
 * 3. Fallback: assign single remaining active tenant (only if exactly one tenant exists)
 *
 * Hard-fails if:
 * - multiple tenants exist and unresolved rows remain after steps 1 and 2
 * - any ambiguous resolution is detected
 */

import { db } from "@/lib/shared/db";

async function backfillPaymentTenant() {
  console.log("Starting Payment.tenantId backfill...");

  // Get initial stats
  const totalPayments = await db.payment.count();
  const initialNullCount = await db.payment.count({ where: { tenantId: null } });

  console.log(`Total Payment rows: ${totalPayments}`);
  console.log(`Payment rows with NULL tenantId: ${initialNullCount}`);

  if (initialNullCount === 0) {
    console.log("No backfill needed - all Payment rows have tenantId populated.");
    return { updated: 0, byDocument: 0, byCounterparty: 0, byFallback: 0, unresolved: 0 };
  }

  let updatedByDocument = 0;
  let updatedByCounterparty = 0;
  let updatedByFallback = 0;

  // Step 1: Resolve via Payment.documentId -> Document.tenantId
  console.log("\nStep 1: Resolving via Document.tenantId...");
  const paymentsWithDocument = await db.payment.findMany({
    where: {
      tenantId: null,
      documentId: { not: null },
    },
    select: {
      id: true,
      documentId: true,
    },
  });

  console.log(`  Found ${paymentsWithDocument.length} payments with documentId`);

  for (const payment of paymentsWithDocument) {
    if (!payment.documentId) continue;

    const document = await db.document.findUnique({
      where: { id: payment.documentId },
      select: { tenantId: true },
    });

    if (document?.tenantId) {
      await db.payment.update({
        where: { id: payment.id },
        data: { tenantId: document.tenantId },
      });
      updatedByDocument++;
    }
  }

  console.log(`  Updated ${updatedByDocument} payments via document path`);

  // Step 2: Resolve via Payment.counterpartyId -> Counterparty.tenantId
  console.log("\nStep 2: Resolving via Counterparty.tenantId...");
  const paymentsWithCounterparty = await db.payment.findMany({
    where: {
      tenantId: null,
      counterpartyId: { not: null },
    },
    select: {
      id: true,
      counterpartyId: true,
    },
  });

  console.log(`  Found ${paymentsWithCounterparty.length} payments with counterpartyId`);

  for (const payment of paymentsWithCounterparty) {
    if (!payment.counterpartyId) continue;

    const counterparty = await db.counterparty.findUnique({
      where: { id: payment.counterpartyId },
      select: { tenantId: true },
    });

    if (counterparty?.tenantId) {
      await db.payment.update({
        where: { id: payment.id },
        data: { tenantId: counterparty.tenantId },
      });
      updatedByCounterparty++;
    }
  }

  console.log(`  Updated ${updatedByCounterparty} payments via counterparty path`);

  // Check remaining unresolved rows
  const remainingNullCount = await db.payment.count({ where: { tenantId: null } });
  console.log(`\nRemaining unresolved payments: ${remainingNullCount}`);

  // Step 3: Fallback to single tenant (only if exactly one tenant exists)
  if (remainingNullCount > 0) {
    console.log("\nStep 3: Attempting fallback to single tenant...");

    const tenants = await db.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    console.log(`  Found ${tenants.length} active tenants`);

    if (tenants.length === 0) {
      console.error("ERROR: No active tenants found. Cannot resolve remaining payments.");
      process.exit(1);
    }

    if (tenants.length > 1) {
      console.error(`ERROR: Multiple active tenants found (${tenants.length}):`);
      for (const tenant of tenants) {
        console.error(`  - ${tenant.name} (${tenant.id})`);
      }
      console.error("Cannot ambiguously assign tenantId to remaining payments.");
      console.error(`Unresolved payments: ${remainingNullCount}`);
      process.exit(1);
    }

    // Exactly one tenant - use as fallback
    const singleTenant = tenants[0];
    console.log(`  Using single tenant: ${singleTenant.name} (${singleTenant.id})`);

    const unresolvedPayments = await db.payment.findMany({
      where: { tenantId: null },
      select: { id: true },
    });

    for (const payment of unresolvedPayments) {
      await db.payment.update({
        where: { id: payment.id },
        data: { tenantId: singleTenant.id },
      });
      updatedByFallback++;
    }

    console.log(`  Updated ${updatedByFallback} payments via fallback path`);
  }

  // Final verification
  const finalNullCount = await db.payment.count({ where: { tenantId: null } });
  console.log(`\n=== Backfill Summary ===`);
  console.log(`Total payments: ${totalPayments}`);
  console.log(`Initial NULL count: ${initialNullCount}`);
  console.log(`Updated via document: ${updatedByDocument}`);
  console.log(`Updated via counterparty: ${updatedByCounterparty}`);
  console.log(`Updated via fallback: ${updatedByFallback}`);
  console.log(`Final NULL count: ${finalNullCount}`);

  if (finalNullCount > 0) {
    console.error(`\nERROR: ${finalNullCount} payments still have NULL tenantId`);
    process.exit(1);
  }

  console.log("\n✅ Backfill completed successfully!");

  return {
    updated: updatedByDocument + updatedByCounterparty + updatedByFallback,
    byDocument: updatedByDocument,
    byCounterparty: updatedByCounterparty,
    byFallback: updatedByFallback,
    unresolved: finalNullCount,
  };
}

backfillPaymentTenant()
  .then((result) => {
    console.log("\nBackfill result:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });

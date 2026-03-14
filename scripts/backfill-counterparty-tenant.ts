/**
 * Backfill script: Assign tenantId to existing Counterparty rows.
 *
 * P4-09: The Counterparty table lacks tenantId. This script assigns the default
 * (first/only) tenant to all existing counterparties that have tenantId = NULL.
 *
 * Strategy:
 * - If there is only one Tenant in the DB: assign that tenant to all counterparties.
 * - If there are multiple Tenants: infer tenant from the counterparty's most recent
 *   confirmed Document that has a tenantId, then fall back to the first/default tenant.
 * - Counterparties with no documents receive the default tenant.
 *
 * This script is idempotent — rows that already have tenantId are skipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-counterparty-tenant.ts
 *
 * Exit codes:
 *   0 — Backfill complete (or nothing to backfill)
 *   1 — Error during backfill
 *
 * See: .qoder/specs/erp-normalization-roadmap.md P4-09
 */

import { db } from "@/lib/shared/db";

interface BackfillStats {
  total: number;
  alreadySet: number;
  inferredFromDocument: number;
  assignedDefault: number;
  errors: number;
}

async function backfillCounterpartyTenant(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    alreadySet: 0,
    inferredFromDocument: 0,
    assignedDefault: 0,
    errors: 0,
  };

  console.log("=== Counterparty.tenantId Backfill (P4-09) ===\n");

  // Get all tenants
  const tenants = await db.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (tenants.length === 0) {
    console.log("No tenants found. Nothing to backfill.");
    return stats;
  }

  const defaultTenantId = tenants[0].id;
  console.log(`Default tenant: ${tenants[0].name} (${defaultTenantId})`);
  console.log(`Total tenants: ${tenants.length}\n`);

  // Get all counterparties with NULL tenantId, along with their most recent document's tenantId
  const rows = await db.$queryRaw<Array<{ id: string; name: string; docTenantId: string | null }>>`
    SELECT
      c.id,
      c.name,
      (
        SELECT d."tenantId"
        FROM "Document" d
        WHERE d."counterpartyId" = c.id
        ORDER BY d."createdAt" DESC
        LIMIT 1
      ) as "docTenantId"
    FROM "Counterparty" c
    WHERE c."tenantId" IS NULL
  `;

  // Also count already-set
  const alreadySetCount = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Counterparty" WHERE "tenantId" IS NOT NULL
  `;
  stats.alreadySet = Number(alreadySetCount[0].count);
  stats.total = rows.length + stats.alreadySet;

  console.log(`Found ${rows.length} counterparties to process (${stats.alreadySet} already set).\n`);

  for (const cp of rows) {
    try {
      let assignedTenantId: string;

      // Try to infer from documents
      if (cp.docTenantId) {
        assignedTenantId = cp.docTenantId;
        stats.inferredFromDocument++;
      } else {
        // Fall back to default tenant
        assignedTenantId = defaultTenantId;
        stats.assignedDefault++;
      }

      await db.counterparty.update({
        where: { id: cp.id },
        data: { tenantId: assignedTenantId },
      });

      process.stdout.write(
        `\rProcessed: ${stats.inferredFromDocument + stats.assignedDefault} | Skipped: ${stats.alreadySet} | Errors: ${stats.errors}`
      );
    } catch (error) {
      stats.errors++;
      console.error(`\nError processing counterparty ${cp.id} (${cp.name}):`, error);
    }
  }

  console.log("\n\n=== Backfill Complete ===");
  console.log(`Total:               ${stats.total}`);
  console.log(`Already set:         ${stats.alreadySet}`);
  console.log(`Inferred from docs:  ${stats.inferredFromDocument}`);
  console.log(`Assigned default:    ${stats.assignedDefault}`);
  console.log(`Errors:              ${stats.errors}`);

  return stats;
}

async function main() {
  try {
    const stats = await backfillCounterpartyTenant();

    if (stats.errors > 0) {
      console.error(`\n❌ Backfill completed with ${stats.errors} error(s). Fix before proceeding.`);
      process.exit(1);
    }

    console.log("\n✅ Backfill complete. Run verify-counterparty-tenant-gate.ts to confirm.");
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

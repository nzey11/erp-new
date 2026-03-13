/**
 * Backfill script: Create Party records for existing Counterparties
 * 
 * This script creates Party and PartyLink records for all existing
 * Counterparties that don't already have a Party association.
 * 
 * Run with: npx tsx scripts/backfill-party-counterparties.ts
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const db = createPrismaClient();

interface BackfillStats {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}

async function backfillCounterparties(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  console.log("Starting Party backfill for Counterparties...\n");

  // Get all active counterparties
  const counterparties = await db.counterparty.findMany({
    where: { isActive: true },
    include: {
      documents: {
        where: { status: "confirmed" },
        select: { confirmedAt: true },
        orderBy: { confirmedAt: "desc" },
        take: 1,
      },
      payments: {
        select: { date: true },
        orderBy: { date: "desc" },
        take: 1,
      },
      interactions: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  stats.total = counterparties.length;
  console.log(`Found ${counterparties.length} active counterparties\n`);

  for (const cp of counterparties) {
    try {
      // Check if PartyLink already exists
      const existingLink = await db.partyLink.findUnique({
        where: {
          entityType_entityId: {
            entityType: "counterparty",
            entityId: cp.id,
          },
        },
      });

      if (existingLink) {
        stats.skipped++;
        continue;
      }

      // Determine lastActivityAt
      const dates = [
        cp.documents[0]?.confirmedAt,
        cp.payments[0]?.date,
        cp.interactions[0]?.createdAt,
      ].filter((d): d is Date => d !== null && d !== undefined);

      const lastActivityAt =
        dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime())))
          : null;

      // Determine party type based on counterparty type
      const partyType = cp.type === "supplier" ? "organization" : "person";

      // Create Party with PartyLink in transaction
      await db.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            displayName: cp.name,
            type: partyType,
            primaryCounterpartyId: cp.id,
            lastActivityAt,
          },
        });

        await tx.partyLink.create({
          data: {
            partyId: party.id,
            entityType: "counterparty",
            entityId: cp.id,
            isPrimary: true,
          },
        });
      });

      stats.created++;
      process.stdout.write(
        `\rCreated: ${stats.created} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`
      );
    } catch (error) {
      stats.errors++;
      console.error(`\nError processing counterparty ${cp.id}:`, error);
    }
  }

  console.log("\n\nBackfill complete!");
  console.log(`Total:    ${stats.total}`);
  console.log(`Created:  ${stats.created}`);
  console.log(`Skipped:  ${stats.skipped}`);
  console.log(`Errors:   ${stats.errors}`);

  return stats;
}

async function main() {
  try {
    const stats = await backfillCounterparties();
    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

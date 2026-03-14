/**
 * Outbox Health Check Script
 *
 * P4-08: Checks for OutboxEvent rows with status "FAILED" or "DEAD" older than 1 hour.
 * On a clean database (CI or post-deploy), this should always exit 0.
 * On production, any exit 1 should trigger an alert.
 *
 * Usage:
 *   npx tsx scripts/check-outbox-health.ts
 *
 * Exit codes:
 *   0 — Outbox is healthy (no stale failed/dead events)
 *   1 — Stale FAILED or DEAD events detected (age > 1 hour)
 *
 * In CI: runs against the test database seeded by prisma db push.
 *        A fresh test DB has no outbox events → always exits 0.
 *        Detects accidental test data leaking into FAILED/DEAD state.
 *
 * In production (post-deploy smoke): runs against live DATABASE_URL.
 *        Exits 1 if any event has been stuck in FAILED/DEAD for > 1 hour.
 *
 * See: .qoder/specs/erp-normalization-roadmap.md P4-08
 * See: app/api/system/outbox/health/route.ts — equivalent HTTP endpoint
 */

import { db } from "@/lib/shared/db";

const ALERT_THRESHOLD_MINUTES = 60;

interface CheckResult {
  status: "FAILED" | "DEAD";
  count: number;
  oldestAgeMinutes: number;
  passed: boolean;
}

async function checkOutboxHealth(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const now = new Date();

  console.log("=== Outbox Health Check (P4-08) ===\n");
  console.log(`Threshold: events older than ${ALERT_THRESHOLD_MINUTES} minutes\n`);

  // Check FAILED events
  console.log("Check 1: FAILED events older than threshold...");
  const staleFailed = await db.outboxEvent.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, createdAt: true, attempts: true },
    take: 10,
  });

  if (staleFailed.length === 0) {
    console.log("  ✅ PASS: No FAILED outbox events\n");
    results.push({ status: "FAILED", count: 0, oldestAgeMinutes: 0, passed: true });
  } else {
    const oldest = staleFailed[0];
    const ageMs = now.getTime() - oldest.createdAt.getTime();
    const ageMin = ageMs / (1000 * 60);

    if (ageMin > ALERT_THRESHOLD_MINUTES) {
      const totalFailed = await db.outboxEvent.count({ where: { status: "FAILED" } });
      console.log(
        `  ❌ FAIL: ${totalFailed} FAILED event(s). Oldest: ${Math.round(ageMin)} minutes ago\n`
      );
      console.log("  First FAILED events:");
      for (const e of staleFailed.slice(0, 5)) {
        const age = Math.round((now.getTime() - e.createdAt.getTime()) / (1000 * 60));
        console.log(`    [${e.id}] type=${e.eventType} attempts=${e.attempts} age=${age}min`);
      }
      console.log("");
      results.push({
        status: "FAILED",
        count: totalFailed,
        oldestAgeMinutes: Math.round(ageMin),
        passed: false,
      });
    } else {
      console.log(
        `  ✅ PASS: ${staleFailed.length} FAILED event(s) but all within threshold (oldest: ${Math.round(ageMin)} min)\n`
      );
      results.push({ status: "FAILED", count: staleFailed.length, oldestAgeMinutes: Math.round(ageMin), passed: true });
    }
  }

  // Check DEAD events
  console.log("Check 2: DEAD events older than threshold...");
  const staleDead = await db.outboxEvent.findMany({
    where: { status: "DEAD" },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, createdAt: true, attempts: true },
    take: 10,
  });

  if (staleDead.length === 0) {
    console.log("  ✅ PASS: No DEAD outbox events\n");
    results.push({ status: "DEAD", count: 0, oldestAgeMinutes: 0, passed: true });
  } else {
    const oldest = staleDead[0];
    const ageMs = now.getTime() - oldest.createdAt.getTime();
    const ageMin = ageMs / (1000 * 60);

    if (ageMin > ALERT_THRESHOLD_MINUTES) {
      const totalDead = await db.outboxEvent.count({ where: { status: "DEAD" } });
      console.log(
        `  ❌ FAIL: ${totalDead} DEAD event(s). Oldest: ${Math.round(ageMin)} minutes ago\n`
      );
      console.log("  First DEAD events:");
      for (const e of staleDead.slice(0, 5)) {
        const age = Math.round((now.getTime() - e.createdAt.getTime()) / (1000 * 60));
        console.log(`    [${e.id}] type=${e.eventType} attempts=${e.attempts} age=${age}min`);
      }
      console.log("");
      results.push({
        status: "DEAD",
        count: totalDead,
        oldestAgeMinutes: Math.round(ageMin),
        passed: false,
      });
    } else {
      console.log(
        `  ✅ PASS: ${staleDead.length} DEAD event(s) but all within threshold (oldest: ${Math.round(ageMin)} min)\n`
      );
      results.push({ status: "DEAD", count: staleDead.length, oldestAgeMinutes: Math.round(ageMin), passed: true });
    }
  }

  return results;
}

async function main() {
  try {
    const results = await checkOutboxHealth();

    console.log("=== Summary ===");
    for (const r of results) {
      const label = r.passed ? "✅ PASS" : "❌ FAIL";
      const detail =
        r.count === 0
          ? "no events"
          : `${r.count} event(s), oldest ${r.oldestAgeMinutes} min`;
      console.log(`  ${label}: ${r.status} — ${detail}`);
    }

    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log("\n✅ Outbox health check PASSED — no stale failed/dead events.");
      process.exit(0);
    } else {
      console.log("\n❌ Outbox health check FAILED — stale events require attention.");
      console.log("\nAction items:");
      console.log("  - Investigate failed/dead events: GET /api/system/outbox/process");
      console.log("  - Re-process if safe: POST /api/system/outbox/process");
      console.log("  - See outbox dead-letter policy in .qoder/specs/erp-architecture-guardrails.md");
      process.exit(1);
    }
  } catch (error) {
    console.error("Health check script failed with error:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

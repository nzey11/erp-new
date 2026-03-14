/**
 * Outbox Health Check Endpoint
 *
 * GET /api/system/outbox/health
 *
 * P4-08: Alerts if any OutboxEvent has status "dead" or "failed" and age > 1 hour.
 *
 * Authentication: Authorization: Bearer <OUTBOX_SECRET>
 *
 * Response (healthy — HTTP 200):
 *   { healthy: true, checks: { failedAge: null, deadAge: null }, stats: {...} }
 *
 * Response (unhealthy — HTTP 503):
 *   {
 *     healthy: false,
 *     alerts: [
 *       { status: "FAILED", count: 3, oldestAgeMinutes: 125, threshold: 60 },
 *       { status: "DEAD",   count: 1, oldestAgeMinutes: 240, threshold: 60 }
 *     ],
 *     stats: {...}
 *   }
 *
 * Intended consumers:
 *   - External monitoring (UptimeRobot, Better Uptime, etc.) — poll on a schedule
 *   - Post-deploy smoke check — call once after deploy to verify clean state
 *   - CI integration test — assert 200 on a clean test database
 *
 * See: .qoder/specs/erp-normalization-roadmap.md P4-08
 */

import { NextRequest, NextResponse } from "next/server";
import { getOutboxStats } from "@/lib/events/outbox";
import { logger } from "@/lib/shared/logger";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Alert threshold: events older than this are considered stale. */
const ALERT_THRESHOLD_MINUTES = 60;

// ─── Authentication ───────────────────────────────────────────────────────────

function validateAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  const expectedSecret = process.env.OUTBOX_SECRET;
  if (!expectedSecret) {
    logger.error("outbox-health", "OUTBOX_SECRET not configured");
    return false;
  }

  return token === expectedSecret;
}

// ─── Health Logic ─────────────────────────────────────────────────────────────

function ageMinutes(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * GET /api/system/outbox/health
 *
 * Returns HTTP 200 if outbox is healthy (no stale failed/dead events).
 * Returns HTTP 503 if any FAILED or DEAD event is older than ALERT_THRESHOLD_MINUTES.
 */
export async function GET(request: NextRequest) {
  if (!validateAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getOutboxStats();

  const alerts: Array<{
    status: string;
    count: number;
    oldestAgeMinutes: number;
    threshold: number;
  }> = [];

  // Check FAILED events
  if (stats.failed > 0 && stats.oldestFailedAt) {
    const ageMin = ageMinutes(stats.oldestFailedAt);
    if (ageMin > ALERT_THRESHOLD_MINUTES) {
      alerts.push({
        status: "FAILED",
        count: stats.failed,
        oldestAgeMinutes: Math.round(ageMin),
        threshold: ALERT_THRESHOLD_MINUTES,
      });
    }
  }

  // Check DEAD events
  if (stats.dead > 0 && stats.oldestDeadAt) {
    const ageMin = ageMinutes(stats.oldestDeadAt);
    if (ageMin > ALERT_THRESHOLD_MINUTES) {
      alerts.push({
        status: "DEAD",
        count: stats.dead,
        oldestAgeMinutes: Math.round(ageMin),
        threshold: ALERT_THRESHOLD_MINUTES,
      });
    }
  }

  const healthy = alerts.length === 0;

  if (!healthy) {
    logger.error("outbox-health", "Outbox health check FAILED — stale events detected", {
      alerts,
    });
  }

  return NextResponse.json(
    {
      healthy,
      ...(alerts.length > 0 ? { alerts } : {}),
      stats,
    },
    { status: healthy ? 200 : 503 }
  );
}

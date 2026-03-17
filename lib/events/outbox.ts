/**
 * Outbox Service — Durable Event Delivery
 *
 * Implements the transactional outbox pattern for domain events.
 * Events are written to the database in the same transaction as the
 * domain change, then processed asynchronously by a worker.
 *
 * Key features:
 * - Atomic claim: prevents race conditions between parallel workers
 * - Exponential backoff: retries with increasing delays
 * - Max attempts: prevents infinite retry loops
 */

import { db } from "@/lib/shared/db";
import { logger } from "@/lib/shared/logger";
import type { OutboxStatus } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DomainEvent } from "./types";

// ─── Configuration ─────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000; // 1 second

/**
 * Calculate backoff delay with exponential increase.
 * Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s, etc.
 */
function calculateBackoff(attempts: number): Date {
  const delayMs = BASE_BACKOFF_MS * Math.pow(2, attempts);
  return new Date(Date.now() + delayMs);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OutboxEventRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: DomainEvent;
  status: OutboxStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create an outbox event. Should be called inside a transaction
 * alongside the domain change.
 *
 * @param tx - Prisma transaction client
 * @param event - The domain event to persist
 * @param aggregateType - Type of aggregate (e.g., "Document")
 * @param aggregateId - ID of the aggregate (e.g., documentId)
 */
export async function createOutboxEvent(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  event: DomainEvent,
  aggregateType: string,
  aggregateId: string
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventType: event.type,
      aggregateType,
      aggregateId,
      payload: event as unknown as Prisma.JsonObject, // Prisma Json type
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
    },
  });
}

/**
 * Atomically claim pending events for processing.
 * Uses UPDATE with subquery to prevent race conditions.
 *
 * @param limit - Maximum number of events to claim
 * @returns Array of claimed events
 */
export async function claimOutboxEvents(limit: number): Promise<OutboxEventRow[]> {
  // PostgreSQL-specific atomic claim using UPDATE ... FROM subquery
  const result = await db.$queryRaw<OutboxEventRow[]>`
    UPDATE "OutboxEvent"
    SET status = 'PROCESSING'
    WHERE id IN (
      SELECT id FROM "OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= NOW()
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;

  return result;
}

/**
 * Mark an event as successfully processed.
 */
export async function markOutboxProcessed(eventId: string): Promise<void> {
  await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });
}

/**
 * Mark an event as failed and schedule retry.
 * If max retries exceeded, transition to DEAD (terminal state).
 */
export async function markOutboxFailed(
  eventId: string,
  error: Error
): Promise<void> {
  const event = await db.outboxEvent.findUnique({
    where: { id: eventId },
    select: { attempts: true, eventType: true, aggregateType: true, aggregateId: true },
  });

  if (!event) return;

  const newAttempts = event.attempts + 1;

  if (newAttempts >= MAX_RETRIES) {
    // Terminal state — max retries exhausted. Requires manual intervention or backfill.
    await db.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: "DEAD",
        attempts: newAttempts,
        lastError: error.message,
      },
    });
    // Log at error level so monitoring can alert on dead events.
    logger.error("outbox", "Outbox event moved to DEAD — max retries exhausted", {
      eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      attempts: newAttempts,
      lastError: error.message,
    });
  } else {
    // Schedule retry with backoff
    await db.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: "PENDING",
        attempts: newAttempts,
        availableAt: calculateBackoff(newAttempts),
        lastError: error.message,
      },
    });
  }
}

/**
 * Get statistics about outbox state (for monitoring).
 */
export async function getOutboxStats(): Promise<{
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  dead: number;
  oldestPendingAt?: Date;
  oldestFailedAt?: Date;
  oldestDeadAt?: Date;
}> {
  const stats = await db.outboxEvent.groupBy({
    by: ["status"],
    _count: true,
  });

  // Find oldest pending event
  const oldestPending = await db.outboxEvent.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // Find oldest failed event (P4-08: age check for alerting)
  const oldestFailed = await db.outboxEvent.findFirst({
    where: { status: "FAILED" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // Find oldest dead event (P4-08: age check for alerting)
  const oldestDead = await db.outboxEvent.findFirst({
    where: { status: "DEAD" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  return {
    pending: stats.find((s) => s.status === "PENDING")?._count ?? 0,
    processing: stats.find((s) => s.status === "PROCESSING")?._count ?? 0,
    processed: stats.find((s) => s.status === "PROCESSED")?._count ?? 0,
    failed: stats.find((s) => s.status === "FAILED")?._count ?? 0,
    dead: stats.find((s) => s.status === "DEAD")?._count ?? 0,
    oldestPendingAt: oldestPending?.createdAt,
    oldestFailedAt: oldestFailed?.createdAt,
    oldestDeadAt: oldestDead?.createdAt,
  };
}

// ─── Event Processing ────────────────────────────────────────────────────────

/**
 * Handler function type for processing domain events.
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => Promise<void>;

/**
 * Global handler registry. Populated by handler modules on import.
 */
const handlerRegistry: Map<string, EventHandler[]> = new Map();

/**
 * Register a handler for an event type.
 */
export function registerOutboxHandler(
  eventType: string,
  handler: EventHandler
): void {
  const handlers = handlerRegistry.get(eventType) ?? [];
  handlers.push(handler);
  handlerRegistry.set(eventType, handlers);
}

/**
 * Clear all registered handlers.
 * FOR TESTS ONLY — resets the registry between test suites.
 * Production code must never call this.
 */
export function clearOutboxHandlers(): void {
  handlerRegistry.clear();
}

/**
 * Process a single event by calling all registered handlers.
 */
async function processEvent(event: OutboxEventRow): Promise<void> {
  const domainEvent = event.payload as DomainEvent;
  const handlers = handlerRegistry.get(domainEvent.type) ?? [];

  if (handlers.length === 0) {
    // Warn but do NOT throw — the event will still be marked PROCESSED below.
    // This prevents PROCESSING limbo (events claimed but never resolved) when
    // a handler is temporarily absent (e.g., deployment gap, feature flag off).
    logger.warn("outbox", `No handlers registered for event type "${domainEvent.type}" — marking as processed`, {
      eventId: event.id,
      eventType: domainEvent.type,
    });
    return;
  }

  for (const handler of handlers) {
    await handler(domainEvent);
  }
}

/**
 * Process pending outbox events.
 *
 * @param limit - Maximum events to process
 * @returns Processing result stats
 */
export async function processOutboxEvents(
  limit: number
): Promise<{
  claimed: number;
  processed: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
}> {
  const events = await claimOutboxEvents(limit);

  if (events.length === 0) {
    return { claimed: 0, processed: 0, failed: 0, errors: [] };
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  for (const event of events) {
    try {
      await processEvent(event);
      await markOutboxProcessed(event.id);
      processed++;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await markOutboxFailed(event.id, err);
      failed++;
      errors.push({ eventId: event.id, error: err.message });
    }
  }

  return { claimed: events.length, processed, failed, errors };
}

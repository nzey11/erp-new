# Phase 2 Status Update — P2-07

**Date:** 2026-03-14  
**Author:** Implementation pass  
**Scope:** Production code change + documentation sync

---

## Summary

P2-07 required adding dead-letter semantics to the outbox processor so that events exhausting all retry attempts transition to a clear, observable terminal state rather than silently accumulating under an ambiguous `FAILED` status.

---

## Why P2-07 is complete

Files changed:

- `prisma/schema.prisma` — `DEAD` added to `OutboxStatus` enum; `FAILED` annotated as deprecated
- `prisma/migrations/20260314_add_outbox_dead_status/migration.sql` — `ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD'`; applied to dev DB via `prisma db execute`
- `lib/events/outbox.ts` — `markOutboxFailed()` updated; `getOutboxStats()` return type extended; `logger` import added
- `scripts/process-outbox.ts` — `--stats` display and post-run summary updated

---

## Old flow vs new flow

**Before — terminal failure path:**
```
5th attempt fails
  → markOutboxFailed()
      → status = "FAILED"
      → attempts = 5
      → lastError = "..."
      [no log emitted — silent terminal state]

getOutboxStats()  →  { pending, processing, processed, failed }
  FAILED bucket:  ambiguous — could mean "will retry" or "terminal"
  (both transient failures and terminal exhaustion used same status)
```

**After — terminal failure path:**
```
5th attempt fails
  → markOutboxFailed()
      → status = "DEAD"
      → attempts = 5
      → lastError = "..."
      → logger.error("outbox", "Outbox event moved to DEAD — max retries exhausted",
            { eventId, eventType, aggregateType, aggregateId, attempts, lastError })

getOutboxStats()  →  { pending, processing, processed, failed, dead }
  DEAD bucket:    unambiguous terminal state — requires manual intervention
  FAILED bucket:  legacy only; no new events written here
```

---

## Exact rule for transition to DEAD

```ts
const newAttempts = event.attempts + 1;
if (newAttempts >= MAX_RETRIES) {
  // → status = "DEAD"
}
```

`MAX_RETRIES = 5` (unchanged). An event becomes `DEAD` after its **5th failed attempt**. Attempts 1–4 return the event to `PENDING` with exponential backoff:

| Attempt | Delay before next retry |
|---------|------------------------|
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |
| 4 | 16s |
| 5 | → DEAD (no further retry) |

---

## FAILED is retained for backward compatibility — confirmed

`FAILED` remains in the `OutboxStatus` enum in `prisma/schema.prisma`, annotated:

```prisma
FAILED    // Deprecated: use DEAD for terminal state. Kept for backward compatibility.
DEAD      // Terminal: max retries exhausted. Requires manual intervention or backfill.
```

- Any existing `OutboxEvent` rows with `status = 'FAILED'` in production continue to be readable
- `getOutboxStats()` still counts them in the `failed` bucket — they remain visible in monitoring
- New code no longer writes `FAILED` as a terminal state; `markOutboxFailed()` writes `DEAD` instead
- No data migration required — old rows are not touched

---

## Stats now expose `dead` separately — confirmed

`getOutboxStats()` return type extended:

```ts
// Before
{ pending, processing, processed, failed, oldestPendingAt? }

// After
{ pending, processing, processed, failed, dead, oldestPendingAt? }
```

This propagates automatically to all callers:

| Surface | Change |
|---|---|
| `GET /api/system/outbox/process` health endpoint | `stats.dead` now present in JSON response |
| `POST /api/system/outbox/process` cron response | `stats.dead` now present in JSON response |
| `scripts/process-outbox.ts --stats` | Prints `Dead: N` |
| `scripts/process-outbox.ts` post-run | Prints `Dead (needs attention): N` when `stats.dead > 0` |

---

## `logger.error` emitted on DEAD transition — confirmed

In `markOutboxFailed()`, when `newAttempts >= MAX_RETRIES`:

```ts
logger.error("outbox", "Outbox event moved to DEAD — max retries exhausted", {
  eventId,
  eventType: event.eventType,
  aggregateType: event.aggregateType,
  aggregateId: event.aggregateId,
  attempts: newAttempts,
  lastError: error.message,
});
```

- `logger` is now statically imported in `outbox.ts` (was not imported before P2-07)
- Log level `error` — picked up by any monitoring system alerting on `ERROR` level logs from the `outbox` source
- Payload includes enough context to identify and manually replay the event

---

## Stuck PROCESSING events not addressed by P2-07

An event that is claimed (`status = PROCESSING`) but whose worker crashes before completing will remain stuck in `PROCESSING` indefinitely. This is a pre-existing edge case. P2-07 does not introduce recovery logic for stuck `PROCESSING` events — that is a separate concern requiring a heartbeat/timeout sweep, not in scope for this task.

---

## Migration delivery note

The `prisma migrate dev` command failed due to a pre-existing shadow database inconsistency (unrelated baseline migrations). The SQL was written manually and applied with:

```sh
npx prisma db execute --file prisma/migrations/20260314_add_outbox_dead_status/migration.sql
```

The migration file at `prisma/migrations/20260314_add_outbox_dead_status/migration.sql` is the authoritative record. For production deployment, the `ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD'` statement must be executed against the production database before deploying the updated application code.

---

## Confirmation: files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `DEAD` added to `OutboxStatus`; `FAILED` annotated as deprecated |
| `prisma/migrations/20260314_add_outbox_dead_status/migration.sql` | New migration file; applied to dev DB |
| `lib/events/outbox.ts` | `markOutboxFailed()`: terminal status `FAILED` → `DEAD`, `logger.error` on DEAD transition, `select` extended with `eventType/aggregateType/aggregateId`; `getOutboxStats()`: return type + result includes `dead`; static `logger` import added |
| `scripts/process-outbox.ts` | `--stats` displays `Dead: N`; post-run warns if `dead > 0` |
| `.qoder/specs/erp-normalization-roadmap.md` | P2-07 task marked ✅ _Complete_; P2-07 risk entry added and retired |
| `.qoder/specs/p2-07-status-update.md` | This file |

No other files were touched. P2-08 has not been started.

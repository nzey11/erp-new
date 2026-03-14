# Phase 2 Status Update — P2-08

**Date:** 2026-03-14
**Scope:** Documentation-only — no production code changed

---

## Summary

P2-08 defines and records the operational contract for the outbox system: the cron interval, maximum acceptable event delivery delay, retry/dead-letter behavior, monitoring obligations, and operator runbook for common failure scenarios.

---

## Why P2-08 is complete

Three architecture documents were updated. No production code was modified.

| Document | Change |
|----------|--------|
| `.qoder/specs/erp-normalization-roadmap.md` | P2-08 task → ✅ Complete with agreed SLA; P2-08 risk entry added and retired |
| `.qoder/specs/erp-architecture-map.md` | Events/Outbox section: added SLA table + monitoring obligations; Event Flow Map diagram: added `every 60s` annotation, SUCCESS/FAILURE branches, SLA note |
| `.qoder/specs/erp-architecture-guardrails.md` | "Retry and Dead-Letter Handling" section: expanded with exact behavior per attempt + backoff table; new "Outbox SLA (P2-08)" section added with monitoring table and operator runbook |

---

## Agreed SLA

| Parameter | Value | Basis |
|-----------|-------|-------|
| Cron trigger interval | **60 seconds** | Operational contract (infrastructure-configured) |
| Max acceptable delay — normal load | **120 seconds** (2 cron cycles) | Agreed SLA |
| Max retry attempts before DEAD | **5** | `MAX_RETRIES` constant in `lib/events/outbox.ts` |
| Retry strategy | Exponential backoff | `BASE_BACKOFF_MS = 1000` × `2^attempt` |
| Cumulative retry window before DEAD | ~62 seconds | Calculated from backoff schedule |
| Batch size per cron run | 10 (default), max 100 | `DEFAULT_LIMIT` / `MAX_LIMIT` in cron route |

**Backoff schedule:**

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 2 s | 2 s |
| 2 | 4 s | 6 s |
| 3 | 8 s | 14 s |
| 4 | 16 s | 30 s |
| 5 → DEAD | 32 s | ~62 s |

---

## Monitoring / Alerting Expectations

| Signal | Alert condition | Severity |
|--------|----------------|----------|
| `pending` count + age | Any `PENDING` event with `createdAt` > 2 min | WARNING |
| `dead` count | `dead > 0` | ERROR — immediate investigation |
| `failed` count trend | Growing `failed` without DEAD progression | WARNING — possible handler regression |
| `processing` count stuck | `processing > 0` for > 5 min | WARNING — worker crash scenario |
| Cron health | No successful cron POST in > 2 min | ERROR |

**Health endpoint:** `GET /api/system/outbox/process` (Bearer-authenticated) — returns `stats` object with all counts and `oldestPendingAt`.

---

## Operator Actions

### If `dead > 0`

1. Query dead events:
   ```sql
   SELECT * FROM "OutboxEvent" WHERE status = 'DEAD' ORDER BY "createdAt" ASC;
   ```
2. Inspect `lastError` and `eventType` to identify the failing handler.
3. Fix the root cause (handler bug, DB inconsistency, missing external dependency).
4. Reset the event for retry:
   ```sql
   UPDATE "OutboxEvent"
   SET status = 'PENDING', attempts = 0, "availableAt" = NOW()
   WHERE id = '<event-id>';
   ```
5. Confirm the next cron run processes it.

### If `pending` is too old (SLA breach)

1. Check cron health — confirm `POST /api/system/outbox/process` is firing with correct `Authorization: Bearer <OUTBOX_SECRET>`.
2. Check application logs for cron-run errors.
3. If cron is healthy but backlog is growing, increase limit:
   ```json
   POST /api/system/outbox/process
   { "limit": 100 }
   ```
4. Emergency manual drain:
   ```
   npx tsx scripts/process-outbox.ts --limit=50
   ```

### If `processing > 0` and not draining (stuck PROCESSING)

Indicates a worker crashed after claiming events but before marking them processed.

1. Stuck events will **not** be retried automatically — they are not `PENDING`.
2. Reset stuck events (safe if workers are all stopped or if the crash confirmed):
   ```sql
   UPDATE "OutboxEvent"
   SET status = 'PENDING', "availableAt" = NOW()
   WHERE status = 'PROCESSING'
     AND "updatedAt" < NOW() - INTERVAL '5 minutes';
   ```
3. Note: automated stuck-PROCESSING recovery is not yet implemented — see P4-08.

---

## Confirmation: No Production Code Changed

P2-08 is a documentation-only task. The SLA, monitoring thresholds, backoff schedule, and operator runbook are derived from existing constants in `lib/events/outbox.ts`:

- `MAX_RETRIES = 5` — already implemented
- `BASE_BACKOFF_MS = 1000` — already implemented
- DEAD state — implemented in P2-07
- `getOutboxStats()` returning `dead` count — implemented in P2-07
- Health endpoint (`GET /api/system/outbox/process`) — already existed

No code was added or changed as part of P2-08.

---

## Explicit Notes

- **Stuck PROCESSING events are not addressed by P2-07 or P2-08.** P2-07 added the DEAD terminal state for events that exhaust retries. Stuck-PROCESSING recovery (worker crash scenario) requires a separate timeout-based reset mechanism — deferred to P4-08.
- **Cron interval is infrastructure-level.** The 60-second SLA is a documented operational contract. It is not enforced by application code. Enforcement depends on the cron scheduler configuration (Vercel Cron, GitHub Actions, or equivalent).
- **`FAILED` status is deprecated but retained.** Existing rows with `status = 'FAILED'` predate P2-07 and are backward-compatible. New failures transition to `PENDING` (retrying) or `DEAD` (terminal). `FAILED` should not appear for new events.

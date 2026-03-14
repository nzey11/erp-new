# Phase 2 — Pre-Deploy Readiness Check

**Date:** 2026-03-14  
**Branch:** current (Phase 2 normalization complete)  
**Assessor:** Pre-deploy verification pass

---

## 1. Scope of Deploy

The following Phase 2 changes are included in this deploy:

| Task | File(s) Changed | Description |
|------|----------------|-------------|
| P2-01 | `app/api/accounting/products/[id]/route.ts` | Emit `product.updated` outbox event in product PUT route, inside `db.$transaction()` |
| P2-02 | `app/api/accounting/sale-prices/route.ts` (or equivalent) | Emit `sale_price.updated` outbox event in sale price mutation route |
| P2-03 | `app/api/accounting/discounts/[id]/route.ts` (or equivalent) | Emit `discount.updated` outbox event in discount mutation route |
| P2-04 | `app/api/auth/customer/telegram/route.ts` | Call `resolveParty()` for new Customers after Telegram auth — graceful degradation |
| P2-05 | `app/api/ecommerce/orders/quick-order/route.ts` | Call `resolveParty()` for new guest Customers — graceful degradation |
| P2-06 | `lib/bootstrap/domain-events.ts` | Remove `registerAccountingHandlers(bus)` from production boot path — `bootstrapDomainEvents()` is now a no-op |
| P2-07 | `prisma/schema.prisma`, `prisma/migrations/20260314_add_outbox_dead_status/migration.sql`, `lib/events/outbox.ts`, `scripts/process-outbox.ts` | Add `DEAD` terminal state to `OutboxStatus` enum; `markOutboxFailed()` now transitions exhausted events to `DEAD`; `getOutboxStats()` exposes `dead` count; logger.error on DEAD transition |
| P2-08 | Documentation only | Outbox SLA and operational rules documented |
| Test fix | `tests/unit/lib/outbox.test.ts` | Updated 3 tests to match P2-07 behavior (`DEAD` status, `dead` stat field) |

**No P1 changes** are included — Phase 1 was a separate prior deploy.

---

## 2. Schema / Migration Readiness

### Prisma schema validation

```
npx prisma validate
→ The schema at prisma\schema.prisma is valid 🚀
```

**Status: PASS**

### OutboxStatus.DEAD migration

Migration file present:

```
prisma/migrations/20260314_add_outbox_dead_status/migration.sql
```

Content:
```sql
ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';
```

**Applied to dev DB:** Yes — applied via `npx prisma db execute` (shadow DB was unavailable due to pre-existing baseline mismatch).

**Status: PASS**

### All migrations present

```
20260226_add_variant_hierarchy
20260227_add_product_image_urls
20260227_add_store_page
20260305_add_category_account_code
20260312_add_processed_webhook
20260312_add_reversing_movements
20260312_add_stock_movements
20260313_add_tenant_architecture
20260313_add_warehouse_tenantId
20260314_add_outbox_dead_status   ← P2-07 migration
```

**Status: PASS**

### Special deployment ordering requirements

| Step | Requirement | Reason |
|------|-------------|--------|
| 1 | Run `ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD'` **before** deploying application code | Application code references `"DEAD"` enum value; migration must precede code activation |
| 2 | Run `npx prisma generate` after migration | Ensures generated Prisma client includes `DEAD` in `OutboxStatus` |
| 3 | Deploy application code | Safe once schema + client are updated |

> **CAUTION:** `ALTER TYPE ... ADD VALUE` on PostgreSQL cannot be rolled back within a transaction in PostgreSQL < 12. On PostgreSQL 12+, it can be run inside a transaction. Verify target Postgres version. If adding a value that does not exist yet in production, the migration is additive and safe.

---

## 3. Code Verification

### TypeScript compilation

```
npx tsc --noEmit
→ (no output — zero errors)
```

**Status: PASS — clean compile**

### Test suite

```
npx vitest run
→ Test Files  38 passed (38)
→ Tests       748 passed (748)
→ Duration    ~100s
```

**Status: PASS — all 748 tests pass**

#### Test coverage for P2 areas

| Area | Test File(s) | Result |
|------|-------------|--------|
| Outbox processing (P2-07) | `tests/unit/lib/outbox.test.ts` (7 tests) | ✅ PASS |
| IEventBus unit tests (P2-06) | `tests/unit/lib/event-bus.test.ts` (2 tests) | ✅ PASS |
| Document confirm/cancel flows | `tests/unit/lib/document-*.test.ts`, integration tests | ✅ PASS (part of 748) |
| Product catalog projection | included in full suite | ✅ PASS |
| Balance / journal handlers | `tests/unit/lib/balance-handler.test.ts`, `journal-handler.test.ts`, `payment-handler.test.ts` | ✅ PASS |
| Party resolver | `tests/unit/lib/party-resolver.test.ts` | ✅ PASS |

> **Note:** There are no dedicated unit tests for the P2-04 / P2-05 Telegram auth and quick-order `resolveParty()` call paths. These are integration-level flows. The graceful-degradation behavior (try/catch that never re-throws) is structurally verified by code review.

### IEventBus production path grep

```
grep: registerAccountingHandlers( — production call sites
→ lib/bootstrap/domain-events.ts:L6  (JSDoc comment only — not a call)
→ lib/events/event-bus.ts:L16        (JSDoc comment only — not a call)
→ lib/modules/accounting/register-handlers.ts:L18  (function definition — not a call)

grep: eventBus.publish( — all files
→ 0 matches

grep: import.*@/lib/shared/db — app/api/**/*.ts
→ 0 matches
```

**Status: PASS — no production path uses `IEventBus` or calls `registerAccountingHandlers()`**

`lib/bootstrap/domain-events.ts::bootstrapDomainEvents()` is confirmed a no-op. `registerAccountingHandlers` function definition exists in `register-handlers.ts` but is never called from any production boot or route path.

---

## 4. Operational Readiness

### Outbox SLA documentation

| Document | Section | Status |
|----------|---------|--------|
| `.qoder/specs/erp-architecture-guardrails.md` | "Retry and Dead-Letter Handling" + "Outbox SLA (P2-08)" | ✅ Present — full backoff table, monitoring table, operator runbook |
| `.qoder/specs/erp-architecture-map.md` | Events/Outbox section + Event Flow Map | ✅ Present — SLA table, delivery sequence with timings |
| `.qoder/specs/p2-08-status-update.md` | Full status doc | ✅ Present |

**Status: PASS**

### Cron processing path

| Processor | File | Status |
|-----------|------|--------|
| HTTP cron endpoint | `app/api/system/outbox/process/route.ts` | ✅ Exists — `POST` (authenticated via `OUTBOX_SECRET`) |
| CLI processor | `scripts/process-outbox.ts` | ✅ Exists — `npx tsx scripts/process-outbox.ts [--limit=N] [--stats]` |
| Health endpoint | `GET /api/system/outbox/process` | ✅ Exists — returns `{ stats: { pending, processing, processed, failed, dead, oldestPendingAt } }` |

All handlers are registered in **both** processors:
- `DocumentConfirmed` → balance, journal, payment handlers
- `product.updated`, `sale_price.updated`, `discount.updated` → catalog handler

**Status: PASS**

### Runbooks

| Scenario | Documented | Location |
|----------|-----------|----------|
| `dead > 0` | ✅ SQL query + fix + reset steps | `erp-architecture-guardrails.md` §6, `p2-08-status-update.md` |
| `pending` SLA breach | ✅ Cron health check + manual drain | `erp-architecture-guardrails.md` §6 |
| Stuck `PROCESSING` | ✅ SQL reset + caveat (not automated) | `erp-architecture-guardrails.md` §6 |

**Status: PASS**

---

## 5. Deploy Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | **`ALTER TYPE ... ADD VALUE 'DEAD'` must precede code deploy** | Certain (ordering dependency) | HIGH — if code deploys before migration, any event that exhausts retries will fail with enum constraint error | Deploy migration first; confirm `prisma db execute` completes before rolling code |
| R2 | **Existing `FAILED` rows in production** | Possible | LOW — these rows are historical and unchanged; code only writes new terminal events as `DEAD` | `FAILED` is retained in the enum; existing rows are unaffected; no data migration needed |
| R3 | **`OUTBOX_SECRET` env var must be set in production** | Unknown | HIGH — if unset, `validateAuth()` returns `false` and `logger.error("OUTBOX_SECRET not configured")` fires; no events will be processed via cron | Verify `OUTBOX_SECRET` is set in production environment before deploy; test cron endpoint manually after deploy |
| R4 | **Shadow DB / `prisma migrate deploy` vs `db execute`** | Medium | MEDIUM — the migration was applied via `db execute` on dev, not via `prisma migrate dev`; in production, `prisma migrate deploy` is the standard path; migration file exists and is correctly formed | Run `prisma migrate deploy` in production — it will apply `20260314_add_outbox_dead_status/migration.sql`; this is the standard and safe path |
| R5 | **P2-04/05 `resolveParty()` — no rollback on Party failure** | Low | LOW — graceful degradation design; Customer is created successfully; Party failure is logged and backfillable | Monitor `logger.error("Party mirror creation failed...")` in production logs post-deploy; run backfill script if gaps detected |
| R6 | **No unit tests for P2-04/05 auth/quick-order Party call** | Present | LOW — behavior is structurally simple (try/catch, no re-throw); auth and order flows are tested via integration tests | Smoke test the Telegram auth and quick-order flows manually post-deploy |
| R7 | **Stuck PROCESSING events not auto-recovered** | Low | MEDIUM — if a worker crashes mid-batch, events remain `PROCESSING` indefinitely | Operator runbook exists (manual SQL reset); automated recovery is P4-08; monitor `processing > 0` for > 5 minutes |

---

## 6. Go / No-Go Recommendation

### **GO with cautions**

All verification checks pass:
- `tsc --noEmit` → clean
- 38/38 test files, 748/748 tests pass
- `prisma validate` → valid
- Zero production `IEventBus` call sites
- Zero `db` imports in route files
- SLA documentation complete
- Operator runbooks present

**Required pre-deploy actions before go-live:**

1. **Verify `OUTBOX_SECRET` is configured** in the production environment. Without it, the cron endpoint rejects all requests silently.
2. **Run `prisma migrate deploy`** in production before activating the new code version. This applies `20260314_add_outbox_dead_status/migration.sql`.
3. **Confirm cron schedule** is configured to POST to `/api/system/outbox/process` every 60 seconds with `Authorization: Bearer <OUTBOX_SECRET>`.

**Post-deploy smoke tests:**

1. `GET /api/system/outbox/process` → returns `{ stats: { dead: 0, pending: N, ... } }`
2. Trigger a product update → confirm a `product.updated` outbox event appears as `PROCESSED` within 2 minutes
3. Check logs for any `"Party mirror creation failed"` entries (P2-04/05)
4. Check logs for any `"OUTBOX_SECRET not configured"` entries

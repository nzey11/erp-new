# Phase 2 — Deployment Runbook

**Date:** 2026-03-14  
**Deploy method:** GitHub Actions CI/CD pipeline (artifact-based)  
**Server:** VPS — release-based deployment under `/var/www/listopt-erp/`  
**Process manager:** pm2 (`listopt-erp` app)

---

## 1. Deployment Scope

The following Phase 2 changes are included in this deploy. Phase 1 changes are assumed to have been merged to `main` prior to this branch; verify the production baseline before deploying.

| Task | Changed File(s) | Nature |
|------|----------------|--------|
| P2-01 | `app/api/accounting/products/[id]/route.ts` | Emit `product.updated` outbox event inside `db.$transaction()` |
| P2-02 | `app/api/accounting/products/[id]/route.ts` | Emit `sale_price.updated` outbox event (inline on same route — triggered when sale price is updated alongside product) |
| P2-03 | `app/api/accounting/products/[id]/discounts/route.ts` | Emit `discount.updated` outbox event inside `db.$transaction()` |
| P2-04 | `app/api/auth/customer/telegram/route.ts` | Call `resolveParty()` after new Customer creation — graceful degradation |
| P2-05 | `app/api/ecommerce/orders/quick-order/route.ts` | Call `resolveParty()` after new guest Customer creation — graceful degradation |
| P2-06 | `lib/bootstrap/domain-events.ts` | Remove `registerAccountingHandlers(bus)` from production boot — function is now no-op |
| P2-07 | `prisma/schema.prisma`, `prisma/migrations/20260314_add_outbox_dead_status/migration.sql`, `lib/events/outbox.ts`, `scripts/process-outbox.ts` | Add `DEAD` terminal state; dead-letter transition on max retries; `getOutboxStats()` exposes `dead` count; `logger.error` on DEAD |
| P2-08 | `.qoder/specs/` (docs only) | Outbox SLA and operational rules documented — no code change |
| Test fix | `tests/unit/lib/outbox.test.ts` | Updated to match P2-07 DEAD behavior |

**Schema change:** One migration — `ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD'`  
**No data migration required.** Existing rows are unaffected.

---

## 2. Required Secrets / Environment

All of the following must be set in `/var/www/listopt-erp/shared/.env` on the production server **before** this deploy proceeds.

| Variable | Required for | Notes |
|----------|-------------|-------|
| `DATABASE_URL` | Prisma — all DB access | `postgresql://user:pass@host:5432/listopt_erp` — must have `ALTER TYPE` privilege for migration |
| `SESSION_SECRET` | Admin session signing | 64-char random hex; must not change between deploys |
| `OUTBOX_SECRET` | **NEW for Phase 2** — cron endpoint auth | Bearer token for `POST /api/system/outbox/process`; must match the value in the cron scheduler config. If unset, the cron endpoint rejects all requests and emits `logger.error("OUTBOX_SECRET not configured")` |
| `STORE_TENANT_ID` | Storefront tenant resolution | Required for guest/ecommerce flows |

**GitHub Actions secrets** (already configured — verify still valid):

| Secret | Used by CI step |
|--------|----------------|
| `DEPLOY_SSH_KEY` | SSH key for `scp` + remote execution |
| `DEPLOY_HOST` | Production server hostname/IP |
| `DEPLOY_USER` | SSH user on production server |
| `NX_CLOUD_ACCESS_TOKEN` | Nx remote cache (optional — pipeline continues without it) |

**Verify `OUTBOX_SECRET` is set before deploying:**
```bash
ssh user@server "grep OUTBOX_SECRET /var/www/listopt-erp/shared/.env"
```
If missing, add it before proceeding:
```bash
echo "OUTBOX_SECRET=<your-secret>" >> /var/www/listopt-erp/shared/.env
```

---

## 3. Required Pipeline Order

The CI pipeline (`ci.yml`) executes in this fixed order on `push` to `main`:

```
┌──────────────────────────────────────────────────────────────────┐
│  Job 1: verify                                                   │
│                                                                  │
│  1. npm ci                                                       │
│  2. npx prisma generate        (client for CI test DB)          │
│  3. npx prisma db push         (test DB schema sync)            │
│  4. npx nx affected -t lint                                      │
│  5. npx nx affected -t test    (748 unit + integration tests)   │
│  6. npx next build             (production build artifact)      │
│  7. E2E tests (Playwright)                                       │
│  8. Package release.tar.gz                                       │
│  9. Upload release-artifact                                      │
└──────────────────────────────────────────────────────────────────┘
                    │ (needs: verify)
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  Job 2: deploy  (push to main only)                             │
│                                                                  │
│  1. Download release-artifact                                    │
│  2. Inject release.json (releaseId, gitSha, builtAt)            │
│  3. SCP archive to /tmp/release.tar.gz on server                │
│  4. On server:                                                   │
│     a. Extract to /var/www/listopt-erp/releases/<RELEASE_ID>/   │
│     b. Link shared/.env                                         │
│     c. npm ci                                                    │
│     d. npx prisma generate   ← generates client from schema     │
│     e. npx prisma migrate deploy  ← APPLIES MIGRATION FIRST    │
│     f. ln -sfn … current     ← symlink switch (goes live)      │
│     g. pm2 delete + pm2 start ecosystem.config.js               │
│     h. Copy scripts to bin/                                      │
│     i. Clean old releases (keep last 7)                         │
│  5. Smoke check:                                                 │
│     - Poll pm2 status → online (12 × 5s = 60s timeout)         │
│     - GET /api/version → releaseId matches expected             │
└──────────────────────────────────────────────────────────────────┘
```

### Why migration must precede the symlink switch

Step `4e` (`prisma migrate deploy`) runs **before** step `4f` (`ln -sfn … current`). This is the critical ordering:

- The new application code references `OutboxStatus.DEAD` in `markOutboxFailed()`.
- Until the `ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD'` migration runs, the Postgres enum does not contain `DEAD`.
- If the symlink were switched before the migration, any event that exhausted its retries would cause a Prisma enum constraint error, breaking the outbox processor.
- The pipeline runs migration in the **new release directory** before making it live, so the old symlink (`current`) continues serving the previous release code while migration completes. The window where old code + new schema coexist is safe: `ADD VALUE` is additive and the old code never writes `DEAD`.

**Safe coexistence window:**  
Old code (no `DEAD`) + new schema (has `DEAD`) → safe (old code never references `DEAD`)  
New code (writes `DEAD`) + old schema (no `DEAD`) → **UNSAFE** — must not happen.

The pipeline ordering guarantees the safe path.

---

## 4. Migration Notes

### Migration: `20260314_add_outbox_dead_status`

**File:** `prisma/migrations/20260314_add_outbox_dead_status/migration.sql`

```sql
-- P2-07: Add DEAD terminal state to OutboxStatus enum.
-- Events that exhaust all retries transition to DEAD instead of FAILED.
-- FAILED is retained for backward compatibility (existing rows, monitoring queries).

ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';
```

**Applied via:** `npx prisma migrate deploy` (standard production migration path)

**Nature:** Additive enum extension — no table rewrites, no data migration, no locks on existing rows.

**PostgreSQL version note:**  
`ALTER TYPE … ADD VALUE` cannot be executed inside a transaction on PostgreSQL < 12. Prisma's `migrate deploy` wraps each migration SQL in a transaction by default. If the production database is PostgreSQL < 12, this will fail.

**Recommended action:** Confirm production Postgres version:
```bash
psql $DATABASE_URL -c "SELECT version();"
```
- PostgreSQL ≥ 12 → `ALTER TYPE … ADD VALUE` is safe inside a transaction. Prisma handles this correctly.
- PostgreSQL < 12 → the migration must be applied manually outside a transaction before deploy:
  ```sql
  ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';
  ```
  Then mark the migration as applied: `npx prisma migrate resolve --applied 20260314_add_outbox_dead_status`

**Rollback:** `ALTER TYPE … ADD VALUE` cannot be reversed by `DROP VALUE` in PostgreSQL (no such command). Once applied, `DEAD` stays in the enum. Rollback at the code level is safe — old code simply never writes `DEAD`. See Section 6.

**Existing data:** All existing `OutboxEvent` rows retain their current status (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`). No rows are updated. `FAILED` rows from before P2-07 remain as-is and are readable by the new code.

---

## 5. Post-Deploy Smoke Checklist

Execute these checks after the pipeline completes and the smoke check step passes.

### Automated (pipeline does this)
- [ ] pm2 status = `online`
- [ ] `GET /api/version` returns expected `releaseId`

### Manual — P2 specific

#### Outbox health
```
GET /api/system/outbox/process
Authorization: Bearer <OUTBOX_SECRET>
```
Expected: `{ "stats": { "pending": <N>, "processing": 0, "dead": 0, ... } }`

- [ ] Response is 200 (not 401) → confirms `OUTBOX_SECRET` is correctly set
- [ ] `stats.dead` field is present (confirms P2-07 schema + code deployed correctly)
- [ ] `stats.pending` is a number (0 is fine; backlog is expected if events accumulated)

#### Trigger a product update
1. In the admin UI, edit any product (change name or description).
2. Wait up to 2 minutes (1 cron cycle).
3. Check: `GET /api/system/outbox/process` → `stats.pending` should decrease or reach 0.
4. Verify `ProductCatalogProjection` for that product reflects the change in the storefront.

- [ ] `product.updated` outbox event created and processed within 2 minutes

#### Trigger a sale price update
1. Update the sale price for any product.
2. Wait up to 2 minutes.
3. Verify storefront reflects the new price.

- [ ] `sale_price.updated` outbox event created and processed

#### Trigger a discount update
1. Update or create a discount for any product.
2. Wait up to 2 minutes.
3. Verify storefront discount reflects the change.

- [ ] `discount.updated` outbox event created and processed

#### Quick-order / guest customer flow (P2-05)
1. Submit a quick-order (buy-one-click) with a new phone number.
2. In the admin CRM, verify a new Party record exists for that phone.
3. Check logs for any `"Party mirror creation failed"` errors — acceptable if Party failed gracefully; order must have completed.

- [ ] Quick-order completes successfully
- [ ] Party mirror created (or failure logged gracefully — order not blocked)

#### Telegram auth customer flow (P2-04)
1. Complete a Telegram login as a new customer (or inspect recent auth logs).
2. Check CRM for a Party record linked to the new Customer.
3. Check logs for any `"Party mirror creation failed"` entries.

- [ ] New Telegram auth creates Party (or failure logged gracefully — login not blocked)

#### Dead-letter check

Verify via health endpoint:
```
GET /api/system/outbox/process
Authorization: Bearer <OUTBOX_SECRET>
```
- [ ] Response contains `"dead": 0` in the `stats` object

Verify directly in the database:
```sql
SELECT id, "eventType", "aggregateType", attempts, "lastError", "createdAt"
FROM "OutboxEvent"
WHERE status = 'DEAD'
ORDER BY "createdAt" ASC;
```
- [ ] Query returns 0 rows immediately post-deploy

#### Cron activity verification
- [ ] Confirm the cron scheduler (Vercel Cron / GitHub Actions scheduled job / crontab) is configured to POST to `https://<host>/api/system/outbox/process` every 60 seconds with `Authorization: Bearer <OUTBOX_SECRET>`
- [ ] After 2 minutes, `stats.pending` is 0 or actively draining (confirming the cron is firing)

#### IEventBus not wired (P2-06)
- [ ] Check application startup logs — no output related to `registerAccountingHandlers` or `bootstrapDomainEvents` wiring handlers
- [ ] `bootstrapDomainEvents()` is called (from `instrumentation.ts`) but is a no-op — no error

---

## 6. Rollback Considerations

### What can be rolled back safely

The rollback script (`/var/www/listopt-erp/bin/rollback-release.sh`) switches the `current` symlink to a previous release directory and reloads pm2. This is **instant** for application code.

**Safe to roll back (code only):**
- All P2-01 through P2-06 code changes — switching symlink to a pre-P2 release is safe
- The old code never references `DEAD` and never calls `resolveParty()` or emits the new outbox events
- `bootstrapDomainEvents()` in the old code registers `registerAccountingHandlers(bus)` but `eventBus.publish()` was never called — side-effect-free

**Rollback command:**
```bash
bash /var/www/listopt-erp/bin/rollback-release.sh
# Auto-selects previous release

bash /var/www/listopt-erp/bin/rollback-release.sh 20260313-195300
# Specific release ID
```

### What requires care after rollback

**The `DEAD` enum value in Postgres cannot be reverted.**  
`ALTER TYPE … ADD VALUE` has no reverse. Once `DEAD` is in the `OutboxStatus` enum:

- Old application code that ran before P2-07 simply does not know about `DEAD` — it will never query for or write `DEAD`. This is safe.
- However, if any events have already transitioned to `DEAD` status (i.e., post-P2 deploy ran and processed some failures), those rows will remain `DEAD` after rollback. The old code's `getOutboxStats()` does not include a `dead` field — the `DEAD` rows will simply not appear in the old stats count. They will not be re-processed.
- This is acceptable: dead events need manual intervention regardless of which app version is running.

**Summary of rollback safety matrix:**

| Scenario | Safe to roll back? | Notes |
|----------|-------------------|-------|
| Roll back P2-01/02/03 (outbox emission) | ✅ Yes | Events emitted after P2 deploy but before rollback will still be processed if the cron was running. After rollback, no new events are emitted for product/price/discount mutations. |
| Roll back P2-04/05 (Party mirror) | ✅ Yes | Customers created after P2 deploy have Party mirrors; new customers created after rollback will not. No data integrity risk. |
| Roll back P2-06 (IEventBus no-op) | ✅ Yes | Old code re-registers handlers into IEventBus — dead weight, but harmless (eventBus.publish() is still never called). |
| Roll back P2-07 code (DEAD transition) | ✅ Yes (code) | Old code transitions exhausted events to `FAILED` again. Any `DEAD` rows already created remain `DEAD` and are not re-processed. |
| Revert `DEAD` from schema | ❌ Not possible | PostgreSQL does not support removing enum values. The `DEAD` value stays in the DB schema permanently. |

---

## 7. Go-Live Checklist

Operator checklist for pressing deploy (merging to `main`).

### Pre-merge

- [ ] All Phase 2 tasks complete and docs synchronized
- [ ] Pre-deploy readiness check passed (`p2-deploy-readiness-check.md`)
  - `tsc --noEmit` → clean
  - 748/748 tests pass
  - `prisma validate` → valid
  - Zero production `IEventBus` call sites
- [ ] `OUTBOX_SECRET` confirmed set in `/var/www/listopt-erp/shared/.env` on the production server
- [ ] Confirm production Postgres version is ≥ 12 (or migration has been applied manually)
- [ ] Cron scheduler configured to `POST /api/system/outbox/process` every 60 seconds with correct `Authorization: Bearer <OUTBOX_SECRET>` header
- [ ] No open incidents or active alerts on the current production deployment

### During deploy (monitor GitHub Actions)

- [ ] `verify` job passes: lint → test → build → E2E
- [ ] `deploy` job: SSH connected, archive uploaded, `npm ci` complete
- [ ] `deploy` job: `prisma generate` complete
- [ ] `deploy` job: `prisma migrate deploy` complete — look for `20260314_add_outbox_dead_status` in migration output
- [ ] `deploy` job: symlink switched, pm2 restarted
- [ ] `deploy` job: smoke check passed — `releaseId` matches expected

### Post-deploy (within 5 minutes)

- [ ] `GET /api/system/outbox/process` returns 200 with `stats.dead` field → `OUTBOX_SECRET` and P2-07 confirmed
- [ ] `stats.dead = 0`
- [ ] After 2 cron cycles (~2 min): `stats.pending` is 0 or draining → cron is firing
- [ ] Trigger a product update → storefront reflects change within 2 minutes
- [ ] Application logs contain no unexpected errors (`pm2 logs listopt-erp --lines 100`)
- [ ] No `"Party mirror creation failed"` errors beyond expected rate
- [ ] No `"OUTBOX_SECRET not configured"` in logs

### If anything fails

1. Check pm2 logs: `pm2 logs listopt-erp --lines 50 --nostream`
2. If app is not online: `bash /var/www/listopt-erp/bin/rollback-release.sh`
3. If migration caused issues: do not drop the `DEAD` enum value — contact the team; roll back code only
4. Document the incident in the roadmap risk log before retrying

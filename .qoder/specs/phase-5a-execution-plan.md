# Phase 5A — Recovery Closure & Safety Remediation
## Execution Plan

**Document Status:** AUTHORITATIVE EXECUTION CONTRACT  
**Authority:** Supersedes all informal task lists within Phase 5A scope  
**References:** `.qoder/specs/erp-recovery-roadmap.md` (R4 tasks, Section D), `.qoder/specs/erp-architecture-map.md`  
**Version:** 1.0

---

## 1. Phase Goal

Phase 5A closes the residual risks that block safe forward development and deployment. Its scope is bounded to: completing R4 (CompanySettings → TenantSettings redirect and DocumentConfirmedEvent tenantId), adding `Payment.tenantId` with full backfill and enforcement, and wrapping two non-atomic service operations in proper transactions. The phase does not improve, expand, or refactor beyond these targets. It ends when all items in the Phase Exit Gate are simultaneously true.

---

## 2. What Is Not In Scope

The following are explicitly excluded from Phase 5A. Any PR that touches these areas is out of scope and must not be merged under this phase.

- Mass route → service layer refactor (50+ route files that import `db` directly)
- ESLint warn → error promotion across the repository
- Removal of backward-compatibility shims in `lib/modules/accounting/documents.ts`
- `lib/crm` vs `lib/party` layout consolidation
- `getTrialBalance()` N+1 performance fix (`app/api/accounting/reports/trial-balance/route.ts`)
- Deprecated function or dead code sweep (beyond code directly modified by in-scope tasks)
- Payment domain redesign, finance service layer refactor, or outbox multi-tenant routing
- Payment numbering, metadata, or UI improvements beyond tenantId enforcement
- Any new user-facing feature work

---

## 3. Phase Rules

1. **Tier 0 completes before Tier 1 begins.** No Tier 1 task may start until the Tier 0 → Tier 1 Gate in Section 6 is fully satisfied.
2. **No scope creep.** Code changes are limited to the exact files listed per task. Adjacent code that is not broken must not be touched.
3. **Task IDs in commits.** Every commit or PR description must reference its task ID (e.g., `5A-R4-01`, `5A-PAY-01`).
4. **R2 verification runs in parallel but gates phase exit.** R2 migration governance verification (Task 5A-R2-V) may run in parallel with other Tier 0 tasks but must be confirmed before Phase 5A is declared complete.
5. **No speculative schema changes.** Only the migrations defined in 5A-PAY-01 and 5A-PAY-06 are permitted.
6. **TypeScript must compile clean after each task.** `npx tsc --noEmit` must exit 0 before the next dependent task begins.

---

## 4. Tier 0 Task List

### 5A-R2-V — Verify R2 Migration Governance

**Target files:**
- `prisma/migrations/` (read-only audit)
- Development database (`_prisma_migrations` table)

**Goal:** Confirm all R2 done criteria from `erp-recovery-roadmap.md` are met. Verify `prisma migrate status` reports zero pending migrations. Confirm all three gate scripts exit 0.

**Done criteria:**
- `_prisma_migrations` table exists with all expected rows
- `prisma migrate status` output shows zero pending migrations
- `npx tsx scripts/verify-product-tenant-gate.ts` exits 0
- `npx tsx scripts/verify-document-tenant-gate.ts` exits 0
- `npx tsx scripts/verify-counterparty-tenant-gate.ts` exits 0
- `.qoder/specs/erp-r2-tenant-migration-rollback.md` exists

**Dependency:** None (runs in parallel with 5A-R4-01 through 5A-R4-05)

---

### 5A-R4-01 — Audit All CompanySettings Read Paths

**Target files:**
- `lib/modules/accounting/` (all `.ts` files — read-only audit)
- `tests/helpers/factories/accounting.ts` (read-only audit)
- `tests/integration/` (read-only audit)

**Goal:** Identify every code path that reads from the `CompanySettings` table. Produce a confirmed list of files and functions that must be redirected to `TenantSettings`.

**Done criteria:**
- A written list of every `CompanySettings` consumer is produced (may be a code comment block or inline note — not a new spec file)
- No code changes made in this task

**Dependency:** None

---

### 5A-R4-02 — Redirect Journal/Accounting Code from CompanySettings to TenantSettings

**Target files:** All files identified in 5A-R4-01 within `lib/modules/accounting/`

**Goal:** Replace all `CompanySettings` reads in the journal and accounting service layer with `TenantSettings` reads. Resolve `TenantSettings` using tenant context available at the call site.

**Done criteria:**
- Zero occurrences of `db.companySettings` or `CompanySettings` reads remain in `lib/modules/accounting/`
- Every call site resolves `TenantSettings` using an explicit `tenantId`
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-R4-01

---

### 5A-R4-03 — Update Test Infrastructure to Use TenantSettings

**Target files:**
- `tests/helpers/factories/accounting.ts`
- All test files that call `seedCompanySettings()` (identified during 5A-R4-01)

**Goal:** Replace `seedCompanySettings()` with a `seedTenantSettings()` equivalent. Update all callers.

**Done criteria:**
- `seedCompanySettings()` no longer exists in `tests/helpers/factories/accounting.ts`
- `seedTenantSettings()` exists and seeds a `TenantSettings` record scoped to a test tenant
- All test files previously calling `seedCompanySettings()` now call `seedTenantSettings()`
- `npm run test:integration` passes with no failures introduced by this change

**Dependency:** 5A-R4-02

---

### 5A-R4-04 — Add tenantId to DocumentConfirmedEvent Payload Type

**Target files:**
- `lib/events/types.ts`

**Goal:** Add `tenantId: string` as a required field on the `DocumentConfirmedEvent` payload interface.

**Done criteria:**
- `DocumentConfirmedEvent.payload.tenantId` is `string` (not optional)
- `npx tsc --noEmit` fails (compile errors at all call sites that construct this event — expected; 5A-R4-05 resolves them)

**Dependency:** 5A-R4-01

---

### 5A-R4-05 — Update DocumentConfirmed Emission to Include tenantId

**Target files:**
- `lib/modules/accounting/services/document-confirm.service.ts`

**Goal:** Pass `tenantId` from the confirmed document record into the `DocumentConfirmedEvent` payload at the point of `createOutboxEvent` call.

**Done criteria:**
- `createOutboxEvent` call site for `DocumentConfirmed` in `document-confirm.service.ts` includes `tenantId` sourced from the document record
- `npx tsc --noEmit` exits 0 (all R4-04 compile errors resolved)
- `npm run test:integration` passes

**Dependency:** 5A-R4-04

---

### 5A-PAY-01 — Add Payment.tenantId as Nullable (Phase 1 Migration)

**Target files:**
- `prisma/schema.prisma` — add `tenantId String?` to `Payment` model, add `tenant Tenant? @relation(...)`, add `@@index([tenantId])`
- `prisma/migrations/` — new migration file generated via `prisma migrate dev`

**Goal:** Add `Payment.tenantId String?` (nullable) with FK to `Tenant` to the schema and database. This is Phase 1 of a two-phase migration. No backfill in this task.

**Done criteria:**
- `prisma/schema.prisma` declares `tenantId String?` on `Payment` with FK relation to `Tenant`
- Migration file exists in `prisma/migrations/`
- `prisma migrate status` shows migration as applied on development database
- `npx tsc --noEmit` exits 0
- `npx prisma validate` exits 0

**Dependency:** 5A-R4-05 complete (event handler in 5A-PAY-04 needs `tenantId` from event payload)

---

### 5A-PAY-02 — Backfill Payment.tenantId

**Target files:**
- `scripts/backfill-payment-tenant.ts` (new script)

**Goal:** Write and execute an idempotent backfill script. Resolution order:
1. `Payment.documentId → Document.tenantId` (primary path)
2. `Payment.counterpartyId → Counterparty.tenantId` (fallback for payments without documentId)
3. Assign the single remaining active tenant for any nulls unresolved by steps 1–2 (only valid when exactly one tenant exists; must hard-fail if multiple tenants exist and nulls remain unresolved)

**Done criteria:**
- Script is idempotent: running it twice produces identical results
- `SELECT COUNT(*) FROM "Payment" WHERE "tenantId" IS NULL` returns 0
- No ambiguous resolutions: every resolution is logged with its source path (document, counterparty, or fallback)
- If multiple tenants exist and any null remains after steps 1–2, script exits non-zero
- All new `Payment` rows created via `app/api/finance/payments/route.ts` POST and `lib/modules/accounting/handlers/payment-handler.ts` since 5A-PAY-01 have `tenantId` populated (verified by inspection — see 5A-PAY-04)

**Dependency:** 5A-PAY-01

---

### 5A-PAY-03 — Verification Gate: 100% Payment tenantId Coverage

**Target files:**
- `scripts/verify-payment-tenant-gate.ts` (new script)

**Goal:** Write and execute a verification gate script that confirms 100% `tenantId` coverage on `Payment`, no ambiguous resolutions, and FK integrity. Gate must exit non-zero on failure.

**Done criteria:**
- `SELECT COUNT(*) FROM "Payment" WHERE "tenantId" IS NULL` returns 0 — gate passes
- FK integrity check: every `Payment.tenantId` references a row in `Tenant` — gate passes
- Gate script exits 0 when all checks pass
- Gate script exits 1 when any NULL or FK violation is present
- Script is integrated into CI alongside the three existing tenant gate scripts in `.github/workflows/ci.yml`

**Dependency:** 5A-PAY-02

---

### 5A-PAY-04 — Update Payment Create Paths to Set tenantId

**Target files:**
- `app/api/finance/payments/route.ts` — POST handler
- `lib/modules/accounting/handlers/payment-handler.ts` — `onDocumentConfirmedPayment()`
- `tests/helpers/factories/` — any factory that calls `db.payment.create`

**Goal:** Ensure all new `Payment` rows are created with `tenantId` populated.

- In `app/api/finance/payments/route.ts` POST: extract `session.tenantId` via `requireAuth()` / `getAuthSession()` and include it in `db.payment.create({ data: { tenantId: session.tenantId, ... } })`
- In `lib/modules/accounting/handlers/payment-handler.ts`: read `tenantId` from `event.payload.tenantId` (available after 5A-R4-05) and include it in `db.payment.create`
- In test factories: add `tenantId` to any `db.payment.create` call, sourced from the test tenant

**Done criteria:**
- POST to `app/api/finance/payments/route.ts` creates a `Payment` row with `tenantId` equal to `session.tenantId`
- `onDocumentConfirmedPayment()` creates a `Payment` row with `tenantId` equal to `event.payload.tenantId`
- No `db.payment.create` call in source or test code omits `tenantId`
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-PAY-01, 5A-R4-05

---

### 5A-PAY-05 — Verify Full Coverage Then Add NOT NULL Constraint (Phase 2 Migration)

**Target files:**
- `prisma/schema.prisma` — change `tenantId String?` to `tenantId String` on `Payment`
- `prisma/migrations/` — new migration file generated via `prisma migrate dev`

**Goal:** After 5A-PAY-02 and 5A-PAY-03 confirm 100% coverage, promote `Payment.tenantId` to NOT NULL.

**Done criteria:**
- 5A-PAY-03 gate exits 0 immediately before this task executes
- `prisma/schema.prisma` declares `tenantId String` (not nullable) on `Payment`
- Migration file exists in `prisma/migrations/`
- `prisma migrate status` shows migration as applied on development database
- `npx prisma validate` exits 0
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-PAY-03, 5A-PAY-04

---

### 5A-PAY-06 — Scope Payment Routes and Reports by tenantId

**Target files:**
- `app/api/finance/payments/route.ts` — GET list handler
- `app/api/finance/payments/[id]/route.ts` — PATCH and DELETE handlers
- `app/api/finance/reports/drill-down/route.ts` — `db.payment.findMany` call at line ~95

**Goal:** Enforce tenant scoping on all payment query paths.

- **GET list** (`route.ts`): add `tenantId: session.tenantId` to the `where` object. Apply to all four parallel queries (`findMany`, `count`, both `aggregate` calls).
- **PATCH** (`[id]/route.ts`): replace `db.payment.findUnique({ where: { id } })` with `db.payment.findFirst({ where: { id, tenantId: session.tenantId } })`. Return 404 if not found.
- **DELETE** (`[id]/route.ts`): same pattern as PATCH.
- **Drill-down report** (`reports/drill-down/route.ts`): add `tenantId: session.tenantId` to the `db.payment.findMany` where clause (line ~95–98). Extract session using `requireAuth()` / `getAuthSession()` if not already present in the handler.

**Done criteria:**
- GET list returns only payments where `tenantId = session.tenantId`
- PATCH returns 404 for a payment belonging to a different tenant
- DELETE returns 404 for a payment belonging to a different tenant
- Drill-down report `db.payment.findMany` includes `tenantId: session.tenantId` in `where`
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-PAY-05

---

## 5. Tier 1 Task List

> **Tier 1 must not begin until the Gate in Section 6 is satisfied.**

---

### 5A-T1-01 — Fix cancelDocumentTransactional() Non-Atomicity

**Target files:**
- `lib/modules/accounting/services/document-confirm.service.ts`

**Goal:** Wrap the document status update and `createReversingMovements()` call in a single `db.$transaction()`. Currently, `db.document.update({ status: "cancelled" })` (line ~444) and `createReversingMovements(documentId)` (line ~461) execute as two separate database operations. A failure between them leaves the document in `cancelled` state with no reversing movements.

**Specific change:** Extract the status update and the reversing movements creation into one `db.$transaction()` block. The `recalculateBalance()` call at line ~467 operates on a projection table and may remain outside the transaction.

**Done criteria:**
- `db.document.update({ status: "cancelled" })` and `db.stockMovement.create` (reversing rows) are inside the same `db.$transaction()` call
- If the transaction fails, the document status remains unchanged
- `npm run test:integration` passes
- `npx tsc --noEmit` exits 0

**Dependency:** All Tier 0 tasks complete (Section 6 gate satisfied)

---

### 5A-T1-02 — Fix getOrCreateCounterparty() Bridge Atomicity

**Target files:**
- `lib/modules/ecommerce/services/counterparty-bridge.service.ts`

**Goal:** Wrap `createCounterpartyWithParty()` and `db.customer.update({ counterpartyId })` in a single `db.$transaction()`. Currently (lines ~36–48), if `createCounterpartyWithParty()` succeeds but `db.customer.update()` fails, a `Counterparty` row exists in the database with no `Customer` linking to it, and the next call will create a second orphaned `Counterparty`.

**Specific change:** Pass the Prisma transaction client (`tx`) through `createCounterpartyWithParty()` and the `db.customer.update()` call, or refactor to inline the operations inside `db.$transaction()`.

**Done criteria:**
- `createCounterpartyWithParty()` and `db.customer.update({ counterpartyId })` execute inside the same `db.$transaction()` call
- If `db.customer.update` fails, no `Counterparty` row is persisted
- `npm run test:integration` passes
- `npx tsc --noEmit` exits 0

**Dependency:** All Tier 0 tasks complete (Section 6 gate satisfied)

---

## 6. Gate: Tier 0 → Tier 1

All of the following must be simultaneously true before any Tier 1 task begins:

- [ ] 5A-R2-V: `prisma migrate status` shows zero pending migrations; all three gate scripts exit 0
- [ ] 5A-R4-01: CompanySettings consumer list produced; no code changes
- [ ] 5A-R4-02: Zero `db.companySettings` reads remain in `lib/modules/accounting/`; `tsc --noEmit` exits 0
- [ ] 5A-R4-03: `seedCompanySettings()` replaced by `seedTenantSettings()`; `npm run test:integration` passes
- [ ] 5A-R4-04 + 5A-R4-05: `DocumentConfirmedEvent.payload.tenantId` is required and populated at emission; `tsc --noEmit` exits 0
- [ ] 5A-PAY-01: `Payment.tenantId String?` nullable migration applied; `prisma migrate status` clean
- [ ] 5A-PAY-02: Backfill script executed; `SELECT COUNT(*) FROM "Payment" WHERE "tenantId" IS NULL` = 0
- [ ] 5A-PAY-03: Verification gate `scripts/verify-payment-tenant-gate.ts` exits 0; integrated into CI
- [ ] 5A-PAY-04: All new `Payment` create paths include `tenantId`; `tsc --noEmit` exits 0
- [ ] 5A-PAY-05: `Payment.tenantId String` NOT NULL migration applied; `prisma migrate status` clean
- [ ] 5A-PAY-06: GET, PATCH, DELETE, and drill-down report all scoped by `tenantId`; `tsc --noEmit` exits 0

---

## 7. Phase Exit Gate

Phase 5A is declared complete when every item below is YES:

| # | Criterion | YES / NO |
|---|-----------|----------|
| 1 | All R4 done criteria from `erp-recovery-roadmap.md` are met (R4-01 through R4-06) | |
| 2 | All 10 Recovery Program completion criteria from `erp-recovery-roadmap.md` Section D are simultaneously true | |
| 3 | `CompanySettings` is not referenced by any active code path in `lib/modules/accounting/` | |
| 4 | `DocumentConfirmedEvent.payload.tenantId` is a required `string` field and is populated at every emission site | |
| 5 | `SELECT COUNT(*) FROM "Payment" WHERE "tenantId" IS NULL` returns 0 | |
| 6 | `Payment.tenantId` is NOT NULL at the database column level | |
| 7 | `Payment.tenantId` has a FK constraint to `Tenant.id` | |
| 8 | `GET /api/finance/payments` filters by `session.tenantId` | |
| 9 | `PATCH /api/finance/payments/[id]` returns 404 for cross-tenant payment | |
| 10 | `DELETE /api/finance/payments/[id]` returns 404 for cross-tenant payment | |
| 11 | `GET /api/finance/reports/drill-down` scopes `db.payment.findMany` by `tenantId` | |
| 12 | `cancelDocumentTransactional()` wraps status update and reversing stock movements in one `db.$transaction()` | |
| 13 | `getOrCreateCounterparty()` wraps `createCounterpartyWithParty()` + `db.customer.update()` in one `db.$transaction()` | |
| 14 | `scripts/verify-payment-tenant-gate.ts` exits 0 | |
| 15 | `npm run test:integration` passes with no failures | |
| 16 | `npx tsc --noEmit` exits 0 | |
| 17 | `prisma migrate status` reports zero pending migrations | |

---

## 8. Rollback Points

### Rollback Point 1 — After 5A-PAY-01 (nullable Payment.tenantId)

**What rollback means:** Revert `prisma/schema.prisma` to remove `tenantId` from `Payment`. Create and apply a down migration that drops the `tenantId` column from `Payment`.

**State preserved:** All existing `Payment` rows are intact. No data is lost. Backfill script (5A-PAY-02) has not yet run.

**How to execute:**
```bash
# 1. Revert schema.prisma to remove tenantId from Payment
# 2. npx prisma migrate dev --name revert_payment_tenantid
# 3. Confirm column is dropped: inspect DB
```

**Safe to trigger:** Any time before 5A-PAY-02 executes.

---

### Rollback Point 2 — After 5A-PAY-02 (backfill executed, column still nullable)

**What rollback means:** Run the Rollback Point 1 procedure. The backfill script is idempotent and non-destructive — it only set values, did not delete rows. Dropping the column removes the backfilled values.

**State preserved:** All `Payment` rows are intact. Tenant association data is lost (acceptable — it was not present before this phase).

**Safe to trigger:** Any time before 5A-PAY-05 executes.

---

### Rollback Point 3 — After 5A-PAY-05 (NOT NULL constraint applied)

**What rollback means:** Remove the NOT NULL constraint by reverting to nullable. Create and apply a down migration that alters the column back to nullable (`ALTER TABLE "Payment" ALTER COLUMN "tenantId" DROP NOT NULL`).

**State preserved:** All `Payment` rows and their `tenantId` values are intact. Column becomes nullable; no data loss.

**How to execute:**
```bash
# 1. Revert schema.prisma: change tenantId String to tenantId String? on Payment
# 2. npx prisma migrate dev --name revert_payment_tenantid_not_null
# 3. Confirm column is nullable: inspect DB
```

**Safe to trigger:** After 5A-PAY-05 and before any dependent NOT NULL enforcement is relied upon in production.

---

### Rollback Point 4 — After 5A-R4-04/05 (DocumentConfirmedEvent type change)

**What rollback means:** Revert `lib/events/types.ts` to remove `tenantId` from `DocumentConfirmedEvent.payload`. Revert `document-confirm.service.ts` emission site. `payment-handler.ts` reverts to not reading `tenantId` from event payload.

**State preserved:** All outbox events already emitted are unaffected (processed events are historical records). Future events will not carry `tenantId`. `Payment.tenantId` backfill from Rollback Point 2 is unaffected.

**Safe to trigger:** Any time. No database schema change is involved.

---

*End of Phase 5A Execution Plan*

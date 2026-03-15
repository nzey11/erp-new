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
4. **R2 verification is COMPLETE.** Task 5A-R2-V is closed. `prisma migrate deploy` succeeded; `prisma migrate status` reports zero pending migrations. This rule is retained for audit trail only.
5. **No speculative schema changes.** Only the migrations defined in 5A-PAY-01 and 5A-PAY-06 are permitted.
6. **TypeScript must compile clean after each task.** `npx tsc --noEmit` must exit 0 before the next dependent task begins.

---

## 4. Tier 0 Task List

### 5A-R2-V — Verify R2 Migration Governance ✅ COMPLETE

**Status:** VERIFIED. `prisma migrate deploy` succeeded. `prisma migrate status` reports zero pending migrations. Three provenance migrations (`20260225_bootstrap_schema`, `20260315_add_document_tenantId_provenance`, `20260315_add_product_tenantId_provenance`) were applied — all idempotent, no data modified.

**Dependency:** Closed.

---

### 5A-R4-01 — Audit All CompanySettings Read Paths

**Target files:**
- `lib/modules/accounting/` (all `.ts` files — read-only audit)
- `tests/helpers/factories/accounting.ts` (read-only audit)
- `tests/integration/` (read-only audit)

**Goal:** Identify every code path that reads from the `CompanySettings` table. Produce a confirmed list of files and functions that must be redirected to `TenantSettings`.

**Done criteria:**
- A written list of every `CompanySettings` consumer is appended as a subsection to this document under **Appendix A: CompanySettings Consumer Inventory** (added at the bottom, before the End marker)
- The list includes: file path, function name, and read field(s) for every consumer
- No code changes made in this task

**Dependency:** None

---

### 5A-R4-02 — Redirect Company Settings API from CompanySettings to TenantSettings

**Target files:**
- `app/api/accounting/settings/company/route.ts`

**Goal:** Replace all `db.companySettings` calls in `app/api/accounting/settings/company/route.ts` with `TenantSettings` equivalents. Both `GET` and `PUT` handlers must resolve `TenantSettings` using `session.tenantId` from `requireAuth()` / `requirePermission()`.

- `GET`: replace `db.companySettings.findFirst()` + `db.companySettings.create()` with `db.tenantSettings.findFirst({ where: { tenantId: session.tenantId } })` + `db.tenantSettings.create({ data: { tenantId: session.tenantId, ... } })`
- `PUT`: same pattern; all reads and writes scoped to `session.tenantId`

**Done criteria:**
- Zero occurrences of `db.companySettings` remain in `app/api/accounting/settings/company/route.ts`
- `GET /api/accounting/settings/company` resolves settings scoped to `session.tenantId`
- `PUT /api/accounting/settings/company` writes settings scoped to `session.tenantId`
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-R4-01

---

### 5A-R4-03 — Update Seed and Test Infrastructure to Use TenantSettings

**Target files:**
- `tests/helpers/factories/accounting.ts` — replace `seedCompanySettings()`
- `prisma/seed-accounts.ts` — replace `createDefaultCompanySettings()`
- `tests/integration/documents/posting-rules.test.ts` — replace inline `seedAccounting()` helper
- `tests/integration/accounting-scenarios.test.ts` — replace `seedCompanySettings()` caller
- `tests/integration/documents/journal.test.ts` — replace `seedCompanySettings()` callers
- `tests/helpers/test-db.ts` — replace `db.companySettings.deleteMany()` in `cleanDatabase()`
- `tests/helpers/factories/index.ts` — update re-export

**Goal:** Replace all `CompanySettings` ORM usage in seed and test infrastructure with `TenantSettings` equivalents. All seeded settings records must be scoped to an explicit test tenant.

- In `tests/helpers/factories/accounting.ts`: replace `seedCompanySettings()` with `seedTenantSettings(tenantId, accountIds)` that creates a `TenantSettings` record with `tenantId` set
- In `prisma/seed-accounts.ts`: replace `createDefaultCompanySettings()` with a `TenantSettings`-based equivalent; requires a seed tenant to exist
- In `tests/integration/documents/posting-rules.test.ts`: update inline `seedAccounting()` helper to call `seedTenantSettings()`
- In `tests/helpers/test-db.ts`: replace `db.companySettings.deleteMany()` with `db.tenantSettings.deleteMany()`
- In all test callers: replace `seedCompanySettings(accountIds)` with `seedTenantSettings(tenantId, accountIds)`

**Done criteria:**
- `seedCompanySettings()` no longer exists in `tests/helpers/factories/accounting.ts`
- `createDefaultCompanySettings()` no longer exists in `prisma/seed-accounts.ts`
- `db.companySettings` is not referenced in any file listed above
- `seedTenantSettings()` exists in `tests/helpers/factories/accounting.ts` and seeds a `TenantSettings` record scoped to an explicit `tenantId`
- `cleanDatabase()` in `tests/helpers/test-db.ts` calls `db.tenantSettings.deleteMany()` instead of `db.companySettings.deleteMany()`
- `npm run test:integration` passes with no failures introduced by this change

**Dependency:** 5A-R4-02

---

### 5A-R4-04 — Add tenantId to DocumentConfirmedEvent Payload Type

**Target files:**
- `lib/events/types.ts`

**Goal:** Add `tenantId: string` as a required field on the `DocumentConfirmedEvent` payload interface.

**Done criteria:**
- `DocumentConfirmedEvent.payload.tenantId` is declared as `string` (not optional) in `lib/events/types.ts`
- All compile errors produced by this change are located exclusively at `DocumentConfirmedEvent` construction sites (i.e., no new errors in unrelated code)
- Compile errors at construction sites are enumerated and tracked as the input work list for 5A-R4-05

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

### 5A-PAY-04 — Update Payment Create Paths to Set tenantId

> **Sequenced before backfill (5A-PAY-02).** All new writes must carry `tenantId` before backfill runs to eliminate the race window where historical rows are clean but new rows arrive without `tenantId`.

**Target files:**
- `app/api/finance/payments/route.ts` — POST handler
- `lib/modules/accounting/handlers/payment-handler.ts` — `onDocumentConfirmedPayment()`
- `tests/helpers/factories/` — any factory that calls `db.payment.create`

**Goal:** Ensure all new `Payment` rows are created with `tenantId` populated.

- In `app/api/finance/payments/route.ts` POST: extract `session.tenantId` via `requireAuth()` / `getAuthSession()` and include it in `db.payment.create({ data: { tenantId: session.tenantId, ... } })`
- In `lib/modules/accounting/handlers/payment-handler.ts`: read `tenantId` from `event.payload.tenantId` (available after 5A-R4-05) and include it in `db.payment.create`
- In test factories: add `tenantId` to any `db.payment.create` call, sourced from the test tenant

**Done criteria:**
- `POST /api/finance/payments` creates a `Payment` row with `tenantId` equal to `session.tenantId` — verifiable by direct DB inspection after request
- `onDocumentConfirmedPayment()` creates a `Payment` row with `tenantId` equal to `event.payload.tenantId`
- No `db.payment.create` call in source or test code omits `tenantId`
- `npx tsc --noEmit` exits 0

**Dependency:** 5A-PAY-01, 5A-R4-05

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

**Dependency:** 5A-PAY-04

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

- [x] 5A-R2-V: COMPLETE — `prisma migrate deploy` succeeded; `prisma migrate status` shows zero pending migrations
- [x] 5A-R4-01: COMPLETE — Appendix A populated; zero consumers in `lib/modules/accounting/`
- [ ] 5A-R4-02: Zero `db.companySettings` reads remain in `app/api/accounting/settings/company/route.ts`; both handlers scoped by `session.tenantId`; `tsc --noEmit` exits 0
- [ ] 5A-R4-03: `db.companySettings` removed from all seed/test files listed in task; `seedTenantSettings()` in place; `npm run test:integration` passes
- [ ] 5A-R4-04 + 5A-R4-05: `DocumentConfirmedEvent.payload.tenantId` is required and populated at emission; `tsc --noEmit` exits 0
- [ ] 5A-PAY-01: `Payment.tenantId String?` nullable migration applied; `prisma migrate status` clean
- [ ] 5A-PAY-04: All new `Payment` create paths include `tenantId`; `POST /api/finance/payments` creates row with correct `tenantId`; `tsc --noEmit` exits 0
- [ ] 5A-PAY-02: Backfill script executed; `SELECT COUNT(*) FROM "Payment" WHERE "tenantId" IS NULL` = 0
- [ ] 5A-PAY-03: Verification gate `scripts/verify-payment-tenant-gate.ts` exits 0; integrated into CI
- [ ] 5A-PAY-05: `Payment.tenantId String` NOT NULL migration applied; `prisma migrate status` clean
- [ ] 5A-PAY-06: GET, PATCH, DELETE, and drill-down report all scoped by `tenantId`; `tsc --noEmit` exits 0

---

## 7. Phase Exit Gate

Phase 5A is declared complete when every item below is YES:

| # | Criterion | YES / NO |
|---|-----------|----------|
| 1 | All R4 done criteria from `erp-recovery-roadmap.md` are met (R4-01 through R4-06) | |
| 2 | All 10 Recovery Program completion criteria from `erp-recovery-roadmap.md` Section D are simultaneously true | |
| 3 | No active production request path reads or writes `CompanySettings`: `app/api/accounting/settings/company/route.ts` uses `TenantSettings` scoped by `session.tenantId`; all in-scope seed/test infrastructure covered by 5A-R4-03 uses `TenantSettings` | |
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

**What rollback means:** Revert `prisma/schema.prisma` to remove `tenantId` from `Payment`. Create and apply a **compensating revert migration** (new forward migration that drops the column — Prisma does not execute down migrations automatically).

**State preserved:** All existing `Payment` rows are intact. No data is lost. Backfill script (5A-PAY-04/02) has not yet run.

**How to execute:**
```bash
# 1. Revert schema.prisma to remove tenantId from Payment model
# 2. npx prisma migrate dev --name compensate_revert_payment_tenantid
# 3. Confirm column is dropped: inspect DB schema
```

**Safe to trigger:** Any time before 5A-PAY-02 executes.

---

### Rollback Point 2 — After 5A-PAY-02 (backfill executed, column still nullable)

**What rollback means:** Execute Rollback Point 1 procedure (compensating migration drops the column). The backfill script is idempotent and non-destructive — it only set values, did not delete rows. Dropping the column removes the backfilled values.

**State preserved:** All `Payment` rows are intact. Tenant association data is lost (acceptable — it was not present before this phase).

**Safe to trigger:** Any time before 5A-PAY-05 executes.

---

### Rollback Point 3 — After 5A-PAY-05 (NOT NULL constraint applied)

**What rollback means:** Revert the NOT NULL constraint by creating a **compensating revert migration** that alters the column back to nullable. Prisma does not reverse migrations automatically — a new forward migration is required.

**State preserved:** All `Payment` rows and their `tenantId` values are intact. Column becomes nullable; no data loss.

**How to execute:**
```bash
# 1. Revert schema.prisma: change tenantId String → tenantId String? on Payment
# 2. npx prisma migrate dev --name compensate_revert_payment_tenantid_not_null
# 3. Confirm column is nullable: inspect DB schema
# Alternative if compensating migration is not viable: restore DB from snapshot
#   taken immediately before 5A-PAY-05, then align _prisma_migrations table
```

**Safe to trigger:** After 5A-PAY-05 and before NOT NULL enforcement is relied upon in production.

---

### Rollback Point 4 — After 5A-R4-04/05 (DocumentConfirmedEvent type change)

**What rollback means:** Revert `lib/events/types.ts` to remove `tenantId` from `DocumentConfirmedEvent.payload`. Revert `document-confirm.service.ts` emission site. `payment-handler.ts` reverts to not reading `tenantId` from event payload.

**State preserved:** All outbox events already emitted are unaffected (processed events are historical records). Future events will not carry `tenantId`. `Payment.tenantId` backfill from Rollback Point 2 is unaffected.

**Safe to trigger:** Any time. No database schema change is involved.

---

## Appendix A: CompanySettings Consumer Inventory

> Populated during task 5A-R4-01. Required before 5A-R4-02 begins.

| File | Function / call site | Fields read |
|------|----------------------|-------------|
| `app/api/accounting/settings/company/route.ts` | `GET` handler | `findFirst()` all fields; `create({ name })` |
| `app/api/accounting/settings/company/route.ts` | `PUT` handler | `findFirst()`; `update(name, inn, kpp, ogrn, fiscalYearStartMonth)`; `create()` same fields |
| `prisma/seed-accounts.ts` | `createDefaultCompanySettings()` | `findFirst()`; `create()` all account mapping fields |
| `tests/helpers/factories/accounting.ts` | `seedCompanySettings()` | `findFirst()`; `create()` all account mapping fields |
| `tests/helpers/test-db.ts` | `cleanDatabase()` | `deleteMany()` |
| `tests/integration/documents/posting-rules.test.ts` | `seedAccounting()` (local inline helper) | `create()` all account mapping fields |
| `scripts/forensic-audit.ts` | Raw SQL string literal only | Table name in `WHERE table_name IN (...)` — read-only audit query, no ORM call; **no redirect needed** |

**Key finding:** Zero `CompanySettings` consumers exist in `lib/modules/accounting/` (service layer). All active ORM consumers are in route layer (1 file) and test/seed infrastructure (3 files). Scope of 5A-R4-02 is therefore `app/api/accounting/settings/company/route.ts` only. 5A-R4-03 covers the 3 test/seed files.

---

*End of Phase 5A Execution Plan*

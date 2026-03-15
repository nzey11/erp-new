# ERP Recovery Program — Execution Plan

**Document Status:** ACTIVE — OPERATIONAL DOCUMENT  
**Governed By:** `.qoder/specs/erp-recovery-roadmap.md`  
**Guardrails:** `.qoder/specs/erp-recovery-guardrails.md`  
**Baseline:** `.qoder/specs/erp-recovery-audit-baseline.md`  
**Amended By:** Pre-execution sanity checks (handler architecture, schema/query integrity, service layer)  

---

## 1. Purpose

This document operationalizes the Recovery Roadmap into a strict task-by-task execution sequence. It is the working reference for the executor during implementation.

The Roadmap defines what must be done and why. The Guardrails define what constraints apply. This document defines the order of execution, the verification expected at each step, and the signals that indicate completion or failure.

This document does not redefine scope, does not add tasks, and does not contain design rationale. Its sole function is to make the Recovery Roadmap executable.

---

## 2. Execution Mode

The following rules govern how all Recovery work is executed.

**One task at a time.** No two tasks from any phase may be in active development simultaneously. Each task must reach its Completion Signal before the next task begins.

**No parallel execution across phases.** Phase R2 may not begin while any R1 task is unresolved. Phase boundaries are hard stops.

**Each task must be verified before moving forward.** Verification is not optional. A task is not complete until its Verification step is passed, regardless of whether the code change is made.

**If a task fails verification, stop and remediate before continuing.** A task that passes code review but fails verification is in state BLOCKED, not DONE. Remediation must occur before proceeding.

**No phase overlap.** No task from a later phase may be started while an earlier phase is in any state other than fully complete with its Exit Gate confirmed.

---

## 3. Phase Execution Order

### R1 — Tenant Isolation Lockdown

| Property | Value |
|----------|-------|
| **Entry Condition** | Recovery Program is initiated; audit baseline and roadmap are confirmed in place |
| **Execution Rule** | Execute R1-01 through R1-13 in dependency order. Tasks with no declared dependency (R1-01, R1-05, R1-11, R1-13) may be started independently of each other but not in parallel. |
| **Completion Checkpoint** | All 13 tasks are in DONE state; `npm run test:integration` passes; tenant predicates confirmed in all modified handlers |
| **Stop Condition** | Any task reaches Failure Signal; any test regression introduced; any scope expansion required |

---

### R2 — Migration Governance Recovery

| Property | Value |
|----------|-------|
| **Entry Condition** | R1 Exit Gate confirmed: all R1 tasks DONE, integration tests pass, code review complete |
| **Execution Rule** | Execute R2-01 through R2-07 in dependency order. R2-01 must complete before any other R2 task begins. |
| **Completion Checkpoint** | `_prisma_migrations` table exists; `prisma migrate status` shows zero pending; all three gates exit 0; rollback document exists |
| **Stop Condition** | `prisma migrate status` shows unexpected state; gate script exits non-zero after baseline; `prisma generate` fails |

---

### R3 — Tenant Test Shield

| Property | Value |
|----------|-------|
| **Entry Condition** | R2 Exit Gate confirmed: zero pending migrations, all gates exit 0 |
| **Execution Rule** | Execute R3-01 through R3-05 in dependency order. R3-01, R3-02, R3-03 may proceed independently after their respective R1 dependencies are confirmed. R3-04 requires R2-05. R3-05 requires R2-05 and R3-04. |
| **Completion Checkpoint** | Minimum 14 tenant isolation tests exist and pass; CI gate step fails on injected NULL and passes on clean data |
| **Stop Condition** | Any new tenant isolation test reveals a handler gap not covered by R1; gate script integration breaks existing pipeline |

---

### R4 — Minimal Architecture Cleanup

| Property | Value |
|----------|-------|
| **Entry Condition** | R3 Exit Gate confirmed: all isolation tests pass, CI gate step integrated and verified |
| **Execution Rule** | Execute R4-01 through R4-06 in dependency order. R4-01 and R4-06 may begin independently. R4-02, R4-03, R4-04, R4-05 depend on R4-01. |
| **Completion Checkpoint** | No `CompanySettings` reads in active code; `DocumentConfirmedEvent` carries `tenantId`; test infrastructure uses `TenantSettings`; all tests pass |
| **Stop Condition** | `CompanySettings` reads cannot be removed without schema change; `tenantId` cannot be populated without missing runtime context |

---

## 4. Task Execution Blocks

---

### R1 Implementation Pattern Reference

> **Applies to all R1 tasks.** These patterns replace any previously stated "compound predicate" wording.

**Session context:** `requirePermission()` returns a `TenantAwareSession` that includes `tenantId`. The return value must be assigned. Example: `const session = await requirePermission("products:read");`. Use `session.tenantId` in all predicates.

**List queries (GET list handlers):**
```ts
const where: Record<string, unknown> = { tenantId: session.tenantId };
// then apply additional filters on top
```

**By-ID reads:** Prisma does not permit `findUnique({ where: { id, tenantId } })` unless `@@unique([id, tenantId])` is declared — which none of the R1 entities define. Use `findFirst` instead:
```ts
const record = await db.product.findFirst({ where: { id, tenantId: session.tenantId } });
if (!record) return NextResponse.json({ error: "..." }, { status: 404 });
```

**Mutation ownership guard (PUT / DELETE):** Prisma `update`/`delete` cannot take `tenantId` in the `where` clause without a unique constraint. Use a pre-flight `findFirst` ownership check, then mutate by `id` only:
```ts
const record = await db.product.findFirst({ where: { id, tenantId: session.tenantId } });
if (!record) return NextResponse.json({ error: "..." }, { status: 404 });
await db.product.update({ where: { id }, data: { ... } });
```

**Warehouse data note:** Existing warehouses created before the tenant architecture migration may have `tenantId = "default-tenant"` due to a historical backfill. After R1 tenant filtering is applied, those records will not appear in any real tenant's queries. This is expected behavior and not an error.

---

### R1-01

**Title:** Add tenant filter to Products GET list  
**Goal:** The `GET /api/accounting/products` response must contain only products belonging to the authenticated user's tenant.  
**Target files/areas:** `app/api/accounting/products/route.ts`  
**Preconditions:** R1 entry condition met; handler file identified and read  
**Implementation boundary:** Assign the return value of `requirePermission()` to get `session.tenantId`. Add `tenantId: session.tenantId` to the `where` object before the `findMany` call. Do not touch POST handler, pagination logic, or search filter logic beyond adding the tenant predicate.  
**Verification:** Manually test with two tenants in the development database. Verify that Product A (Tenant A) is not returned when requesting as Tenant B. Run `npm run test:integration` and confirm no regressions.  
**Completion signal:** GET list returns only records where `tenantId = session.tenantId`; existing tests pass.  
**Failure signal:** Products from another tenant appear in the response; existing integration test fails.

---

### R1-02

**Title:** Add tenant ownership check to Product GET by ID  
**Goal:** GET by product ID must return 404 when the product belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/products/[id]/route.ts` — GET handler only  
**Preconditions:** R1-01 DONE  
**Implementation boundary:** Modify only the GET handler's query. Replace `findUnique({ where: { id } })` with `findFirst({ where: { id, tenantId: session.tenantId } })` (see R1 Implementation Pattern Reference above). Assign the `requirePermission()` return value to access `session.tenantId`. Do not modify PUT or DELETE handlers in this task.  
**Verification:** Create a product under Tenant B; request it as Tenant A; confirm 404. Run `npm run test:integration`.  
**Completion signal:** GET by ID for another tenant's product returns 404; no regressions.  
**Failure signal:** Another tenant's product is returned; HTTP status is 200 or 403 instead of 404.

---

### R1-03

**Title:** Add tenant ownership check to Product PUT  
**Goal:** PUT on a product ID must reject the request with 404 if the product belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/products/[id]/route.ts` — PUT handler only  
**Preconditions:** R1-02 DONE  
**Implementation boundary:** Modify only the PUT handler. Add a pre-flight `findFirst({ where: { id, tenantId: session.tenantId } })` ownership check before the `db.$transaction` update block executes. Return 404 if null. Then perform the existing `update({ where: { id } })` as before. Do not modify the DELETE handler or shared utilities in this task.  
**Verification:** Attempt PUT on another tenant's product; confirm 404. Confirm PUT on own tenant's product still succeeds. Run `npm run test:integration`.  
**Completion signal:** PUT returns 404 for cross-tenant product; own-tenant PUT succeeds; no regressions.  
**Failure signal:** Cross-tenant PUT succeeds; own-tenant PUT breaks.

---

### R1-04

**Title:** Add tenant ownership check to Product DELETE  
**Goal:** DELETE on a product ID must reject with 404 if the product belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/products/[id]/route.ts` — DELETE handler only  
**Preconditions:** R1-02 DONE  
**Implementation boundary:** Modify only the DELETE handler. Add a pre-flight `findFirst({ where: { id, tenantId: session.tenantId } })` ownership check before the soft-delete `update` executes. Return 404 if null. Then perform the existing `update({ where: { id } })` as before. Do not modify the PUT handler.  
**Verification:** Attempt DELETE on another tenant's product; confirm 404. Confirm DELETE on own tenant's product still succeeds. Run `npm run test:integration`.  
**Completion signal:** DELETE returns 404 for cross-tenant product; own-tenant DELETE succeeds; no regressions.  
**Failure signal:** Cross-tenant DELETE succeeds; own-tenant DELETE breaks.

---

### R1-05

**Title:** Add tenant filter to Documents GET list  
**Goal:** The `GET /api/accounting/documents` response must contain only documents belonging to the authenticated user's tenant.  
**Target files/areas:** `app/api/accounting/documents/route.ts`  
**Preconditions:** R1 entry condition met  
**Implementation boundary:** Modify only the `where` clause construction in the GET handler. Do not touch POST handler, type/status filters, or pagination.  
**Verification:** Create documents under two tenants; verify Tenant A cannot see Tenant B's documents. Run `npm run test:integration`.  
**Completion signal:** GET list returns only `tenantId = session.tenantId` records; no regressions.  
**Failure signal:** Documents from another tenant appear in the response.

---

### R1-06

**Title:** Add tenant ownership check to Document GET by ID  
**Goal:** GET by document ID must return 404 when the document belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/documents/[id]/route.ts` — GET handler only  
**Preconditions:** R1-05 DONE  
**Implementation boundary:** Modify only the GET handler's query. Replace `findUnique({ where: { id } })` with `findFirst({ where: { id, tenantId: session.tenantId } })`. Assign the `requirePermission()` return value to access `session.tenantId`. Do not modify PUT, DELETE, or related includes.  
**Verification:** Request another tenant's document by ID; confirm 404. Run `npm run test:integration`.  
**Completion signal:** GET by ID for another tenant's document returns 404; no regressions.  
**Failure signal:** Another tenant's document is returned; status is not 404.

---

### R1-07

**Title:** Add tenant ownership check to Document PUT  
**Goal:** PUT on a document ID must return 404 if the document belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/documents/[id]/route.ts` — PUT handler only  
**Preconditions:** R1-06 DONE  
**Implementation boundary:** The handler already performs a pre-flight `findUnique({ where: { id } })` for status validation. Replace it with `findFirst({ where: { id, tenantId: session.tenantId } })`. Assign the `requirePermission()` return value to access `session.tenantId`. The null-check and 404 return already present in the handler will cover both "not found" and "wrong tenant" cases. The subsequent `update({ where: { id } })` remains unchanged. Do not modify DELETE handler or item replacement logic.  
**Verification:** Attempt PUT on another tenant's document; confirm 404. Own-tenant PUT must still succeed. Run `npm run test:integration`.  
**Completion signal:** PUT returns 404 for cross-tenant document; own-tenant PUT succeeds; no regressions.  
**Failure signal:** Cross-tenant PUT succeeds or own-tenant PUT breaks.

---

### R1-08

**Title:** Add tenant ownership check to Document DELETE  
**Goal:** DELETE on a document ID must return 404 if the document belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/documents/[id]/route.ts` — DELETE handler only  
**Preconditions:** R1-06 DONE  
**Implementation boundary:** The handler already performs a pre-flight `findUnique({ where: { id } })` for status validation. Replace it with `findFirst({ where: { id, tenantId: session.tenantId } })`. Assign the `requirePermission()` return value to access `session.tenantId`. The existing null-check and 404 return cover both cases. The subsequent `delete({ where: { id } })` remains unchanged. Do not modify PUT or status validation logic.  
**Verification:** Attempt DELETE on another tenant's document; confirm 404. Own-tenant DELETE must still succeed. Run `npm run test:integration`.  
**Completion signal:** DELETE returns 404 for cross-tenant document; own-tenant DELETE succeeds; no regressions.  
**Failure signal:** Cross-tenant DELETE succeeds or own-tenant DELETE breaks.

---

### R1-09

**Title:** Propagate tenantId to document confirm service  
**Goal:** The confirm API handler must pass `session.tenantId` to `confirmDocumentTransactional()`, and the service must verify ownership before confirming.  
**Target files/areas:**
- `app/api/accounting/documents/[id]/confirm/route.ts`
- `lib/modules/accounting/services/document-confirm.service.ts` — confirm function only
- `lib/modules/accounting/services/document-bulk-confirm.service.ts` — signature + pre-check update
- `app/api/accounting/documents/bulk-confirm/route.ts` — pass tenantId to bulk service
- `app/api/accounting/ecommerce/orders/[id]/route.ts` — `"confirmed"` branch only
- `lib/modules/ecommerce/services/order-payment.service.ts` — webhook and admin confirm paths

**Preconditions:** R1-06 DONE  
**Implementation boundary:**

1. **Service signature:** Add `tenantId: string` as a required third parameter to `confirmDocumentTransactional(documentId, actor, tenantId)`. No optional/nullable variant. The signature is always called with a value.

2. **Service initial load:** Replace the existing `db.document.findUnique({ where: { id: documentId } })` with `db.document.findFirst({ where: { id: documentId, tenantId } })`. This enforces ownership verification at the query level. The existing `if (!doc)` null-check already covers both "not found" and "wrong tenant" cases — no new error class is needed. 404 is the correct response in both cases (per INV-T-02).

3. **Direct API confirm route** (`confirm/route.ts`): Assign the `requirePermission()` return value; pass `session.tenantId` to the service.

4. **Bulk confirm route** (`bulk-confirm/route.ts`): Route already calls `getAuthSession()`. Pass `session.tenantId` to `bulkConfirmDocuments()`.

5. **Bulk confirm service** (`document-bulk-confirm.service.ts`): Add `tenantId: string` to `BulkConfirmInput`. Replace the fast-path `db.document.findUnique({ where: { id } })` with `db.document.findFirst({ where: { id, tenantId } })`. Pass `tenantId` in each `confirmDocumentTransactional(id, actor, tenantId)` call. Note: a document from another tenant failing the fast-path check will now surface as a `DocumentConfirmError` collected in `errors[]` rather than a silent skip — this is the correct strict behavior.

6. **Ecommerce orders route** (`orders/[id]/route.ts` — `"confirmed"` branch only): This branch calls `confirmDocumentTransactional(id, session?.username ?? null)` without a surrounding `try/catch` for `DocumentConfirmError`, which would cause tenant-mismatch 404s to surface as 500. Wrap this branch in a `try/catch` mirroring the pattern used in the confirm route. Then pass `session.tenantId`.

7. **Webhook / ecommerce payment path** (`order-payment.service.ts`): `confirmEcommerceOrderPayment()` is called from both admin UI (has session) and the payment webhook (no session). For webhook-originated calls, the caller does not have a session. The caller must extract `tenantId` from the document it already loads before calling `confirmDocumentTransactional`. The document is loaded earlier in the function via `db.document.findUnique({ where: { id: documentId } })` — `document.tenantId` is available from that result. Pass `document.tenantId` as the `tenantId` argument. Do not introduce an optional `tenantId` parameter — the argument must always be provided.

Do not modify the cancel function, stock movement logic, outbox payload, or journal posting in this task.

**Verification:** Attempt to confirm another tenant's document via each call path (direct route, bulk route, ecommerce orders route). All must return 404 before any state transition occurs. Own-tenant confirm must still succeed across all paths. Run `npm run test:integration`.  
**Completion signal:** Cross-tenant confirm returns 404 via all call paths; own-tenant confirm succeeds; no regressions.  
**Failure signal:** Cross-tenant confirm succeeds or triggers a partial state transition via any call path; bulk confirm silently skips cross-tenant documents without collecting them as errors.

---

### R1-10

**Title:** Propagate tenantId to document cancel service  
**Goal:** The cancel API handler must pass `session.tenantId` to `cancelDocumentTransactional()`, and the service must verify ownership before cancelling.  
**Target files/areas:**
- `app/api/accounting/documents/[id]/cancel/route.ts`
- `lib/modules/accounting/services/document-confirm.service.ts` — cancel function only
- `app/api/accounting/ecommerce/orders/[id]/route.ts` — `"cancelled"` branch only
- `lib/modules/ecommerce/services/order-cancel.service.ts` — `cancelEcommerceOrder()` function

**Preconditions:** R1-06 DONE  
**Implementation boundary:**

1. **Service signature:** Add `tenantId: string` as a required third parameter to `cancelDocumentTransactional(documentId, actor, tenantId)`. No optional/nullable variant.

2. **Service initial load:** Replace the existing `db.document.findUnique({ where: { id: documentId } })` with `db.document.findFirst({ where: { id: documentId, tenantId } })`. This enforces ownership verification at the query level. The existing `if (!doc)` null-check covers both "not found" and "wrong tenant" with a 404 error.

3. **Direct API cancel route** (`cancel/route.ts`): Assign the `requirePermission()` return value; pass `session.tenantId` to the service.

4. **Ecommerce orders route** (`orders/[id]/route.ts` — `"cancelled"` branch): This branch calls `cancelEcommerceOrder({ documentId, actor })`. Update `cancelEcommerceOrder()` to accept `tenantId` and pass it through. For this route, `session.tenantId` is available from the existing `getAuthSession()` call.

5. **Ecommerce order cancel service** (`order-cancel.service.ts` — `cancelEcommerceOrder()` only): Add `tenantId: string` to the params object. The service already loads the document with `findUnique({ where: { id: documentId } })` for pre-validation — replace with `findFirst({ where: { id: documentId, tenantId } })`. Pass `tenantId` in the `cancelDocumentTransactional(documentId, actor, tenantId)` call. The `cancelOrder()` function in the same file is currently unreachable (no active callers) — it does not require update in R1.

Do not modify the confirm function, reversal logic, or balance recalculation logic.

**Verification:** Attempt to cancel another tenant's document via each call path (direct route, ecommerce orders route). All must return 404. Own-tenant cancel must still succeed across all paths. Run `npm run test:integration`.  
**Completion signal:** Cross-tenant cancel returns 404 via all call paths; own-tenant cancel succeeds; no regressions.  
**Failure signal:** Cross-tenant cancel succeeds or own-tenant cancel breaks via any call path.

---

### R1-11

**Title:** Add tenant filter to Counterparties GET list  
**Goal:** The `GET /api/accounting/counterparties` response must contain only counterparties belonging to the authenticated user's tenant.  
**Target files/areas:** `app/api/accounting/counterparties/route.ts`  
**Preconditions:** R1 entry condition met  
**Implementation boundary:** Assign the `requirePermission()` return value to get `session.tenantId`. Add `tenantId: session.tenantId` to the `where` object before the `findMany` call. Do not modify POST or search logic beyond the tenant predicate.  
**Verification:** Create counterparties under two tenants; verify Tenant A cannot see Tenant B's counterparties. Run `npm run test:integration`.  
**Completion signal:** GET list returns only `tenantId = session.tenantId` records; no regressions.  
**Failure signal:** Cross-tenant counterparties appear in the response.

---

### R1-12

**Title:** Add tenant ownership checks to Counterparty GET/PUT/DELETE by ID  
**Goal:** All three by-ID handlers must return 404 when the counterparty belongs to a different tenant.  
**Target files/areas:** `app/api/accounting/counterparties/[id]/route.ts`  
**Preconditions:** R1-11 DONE  
**Implementation boundary:** Modify GET, PUT, and DELETE handlers in this file. Assign the `requirePermission()` return value in each handler to get `session.tenantId`.

- **GET:** Replace `findUnique({ where: { id } })` with `findFirst({ where: { id, tenantId: session.tenantId } })`.
- **PUT:** Add a pre-flight `findFirst({ where: { id, tenantId: session.tenantId } })` before the `update({ where: { id } })`. Return 404 if null.
- **DELETE:** Add a pre-flight `findFirst({ where: { id, tenantId: session.tenantId } })` before the soft-delete `update({ where: { id } })`. Return 404 if null.

Do not modify the counterparty's Party side-effect logic or the `getBalance()` call.

**Verification:** Test each handler (GET, PUT, DELETE) with a cross-tenant counterparty ID; all must return 404. Own-tenant operations must still succeed. Run `npm run test:integration`.  
**Completion signal:** All three handlers return 404 for cross-tenant IDs; own-tenant operations succeed; no regressions.  
**Failure signal:** Any of the three handlers allows cross-tenant access; own-tenant operation breaks.

---

### R1-13

**Title:** Add tenant filter to Finance Payments GET list  
**Goal:** Apply tenant scoping to the GET list in the finance payments handler. If the `Payment` model lacks `tenantId`, this task terminates with a formal blocker record.  
**Target files/areas:** `app/api/finance/payments/route.ts` — GET handler only  
**Preconditions:** R1 entry condition met  
**Implementation boundary:** Inspect the `Payment` model schema. If `tenantId` exists, add the predicate to the GET handler's `where` clause. If it does not exist, record a formal model-level blocker and mark this task BLOCKED. Do not add a `tenantId` column to the `Payment` model — schema changes are out of scope for R1.  
**Verification:** If applied: verify GET list returns only current tenant's payments. If blocked: confirm blocker is formally recorded with file reference and deferred to Phase 5.  
**Completion signal:** Tenant filter applied and verified — OR — blocker formally documented and task marked BLOCKED with reason.  
**Failure signal:** Task neither applies the fix nor documents the blocker; `Payment` model is modified to add `tenantId`.

---

### R2-01

**Title:** Audit current migration file inventory  
**Goal:** Produce a confirmed, ordered list of all 12 migration files and verify their content against the current database schema.  
**Target files/areas:** `prisma/migrations/` directory — read only  
**Preconditions:** R1 Exit Gate confirmed  
**Implementation boundary:** Read and enumerate migration files only. No file modifications, no database changes.  
**Verification:** List of 12 migration filenames with confirmed content summary exists as a working artifact. Each migration's content is cross-referenced against the current `schema.prisma` to confirm alignment.  
**Completion signal:** Confirmed ordered list of 12 migrations exists; each is verified as representing an already-applied change.  
**Failure signal:** Migration file content contradicts current `schema.prisma`; fewer or more than 12 files found.

---

### R2-02

**Title:** Establish migration baseline on development database  
**Goal:** Mark all 12 existing migrations as applied so that `prisma migrate status` reports zero pending and `_prisma_migrations` table is populated.  
**Target files/areas:** Development database; `prisma/migrations/` (read only during baseline execution)  
**Preconditions:** R2-01 DONE; confirmed ordered list of 12 migrations available  
**Implementation boundary:** Execute `prisma migrate resolve --applied` for each migration in order. Do not modify any migration file content. Do not run `prisma migrate deploy` at this step.  
**Verification:** Run `prisma migrate status`. Confirm output shows all migrations as applied and zero pending. Query `SELECT COUNT(*) FROM "_prisma_migrations"` — must return 12.  
**Completion signal:** `prisma migrate status` shows zero pending; `_prisma_migrations` has exactly 12 rows.  
**Failure signal:** `prisma migrate status` still shows pending migrations; `_prisma_migrations` table does not exist or has wrong row count.

---

### R2-03

**Title:** Create missing migration file for Product.tenantId  
**Goal:** A migration file representing the `Product.tenantId` column addition must exist in `prisma/migrations/`, safe to apply on a database where the column already exists.  
**Target files/areas:** `prisma/migrations/` — new file  
**Preconditions:** R2-02 DONE  
**Implementation boundary:** Create one new migration directory and SQL file. The SQL must be idempotent or pre-checked (e.g., `IF NOT EXISTS`). Do not modify any other migration file or `schema.prisma`.  
**Verification:** Run `prisma migrate resolve --applied` for the new migration file. Confirm `prisma migrate status` still shows zero pending. Confirm the file's SQL does not alter any column that does not already exist.  
**Completion signal:** Migration file exists; marked as applied; `prisma migrate status` remains at zero pending.  
**Failure signal:** Migration file applies changes that break the existing schema; `prisma migrate status` shows the new migration as pending after baseline.

---

### R2-04

**Title:** Create missing migration file for Document.tenantId  
**Goal:** A migration file representing the `Document.tenantId` column addition must exist in `prisma/migrations/`, safe to apply on a database where the column already exists.  
**Target files/areas:** `prisma/migrations/` — new file  
**Preconditions:** R2-02 DONE  
**Implementation boundary:** Same approach as R2-03. One new migration directory and SQL file. Do not touch other migrations or `schema.prisma`.  
**Verification:** Same as R2-03: mark applied, confirm zero pending, confirm SQL safety.  
**Completion signal:** Migration file exists; marked as applied; `prisma migrate status` remains at zero pending.  
**Failure signal:** Same as R2-03.

---

### R2-05

**Title:** Run verification gates against development database  
**Goal:** All three gate scripts must exit with code 0 against the current development database state.  
**Target files/areas:** `scripts/verify-product-tenant-gate.ts`, `scripts/verify-document-tenant-gate.ts`, `scripts/verify-counterparty-tenant-gate.ts`  
**Preconditions:** R2-02, R2-03, R2-04 DONE  
**Implementation boundary:** Execute gate scripts only. Do not modify gate script logic. If a gate fails, the root cause must be investigated and remediated before this task can be marked DONE — but remediation is a separate step, not within this task's boundary.  
**Verification:** Each script exits with code 0. Exit codes and output are recorded.  
**Completion signal:** All three gate scripts exit 0; output documented.  
**Failure signal:** Any gate exits non-zero; root cause must be identified and escalated before proceeding.

---

### R2-06

**Title:** Document rollback procedure for tenant migrations  
**Goal:** A concise runbook describing rollback steps for each tenant migration (Warehouse, Counterparty, Product, Document) must exist in `.qoder/specs/`.  
**Target files/areas:** `.qoder/specs/` — new document (the only documentation artifact permitted in R2)  
**Preconditions:** R2-02 DONE  
**Implementation boundary:** Create one document only. Describe rollback requirements in terms of schema state, data state, and re-seeding requirements. Do not include implementation scripts or speculative procedures.  
**Verification:** Document exists in `.qoder/specs/`. Document addresses all four tenant migration entities. Content is factual and references confirmed migration file names.  
**Completion signal:** Rollback document exists and covers all four entities.  
**Failure signal:** Document missing; document contains only generic rollback advice without entity-specific content.

---

### R2-07

**Title:** Verify prisma migrate status on development  
**Goal:** Confirm that after R2-02 through R2-04, `prisma migrate status` shows all migrations applied and zero pending.  
**Target files/areas:** Development database — verification only  
**Preconditions:** R2-03 and R2-04 DONE  
**Implementation boundary:** Run `prisma migrate status` and record output. This is a verification task. No changes are made.  
**Verification:** Output of `prisma migrate status` shows: all migrations as applied, zero pending migrations.  
**Completion signal:** Command exits 0 with zero pending migrations reported.  
**Failure signal:** Any migration shown as pending; command exits non-zero.

---

### R3-01

**Title:** Create tenant isolation test file for Products  
**Goal:** Integration tests must verify that product list and by-ID operations are tenant-scoped.  
**Target files/areas:** `tests/integration/api/tenant-isolation/products.test.ts` — new file  
**Preconditions:** R1-01, R1-02, R1-03, R1-04 all DONE  
**Implementation boundary:** Create one new test file in the `tenant-isolation/` directory. Tests must use two distinct tenants. Do not modify existing test files or the products API handler.  
**Verification:** Run new test file in isolation. All 4 scenarios must pass: (1) GET list isolation, (2) GET by ID returns 404, (3) PUT returns 404, (4) DELETE returns 404. Run full `npm run test:integration` to confirm no regressions.  
**Completion signal:** 4 passing tests; no regressions in full suite.  
**Failure signal:** Any of the 4 tests fails; reveals a handler gap not closed by R1 (triggers stop rule).

---

### R3-02

**Title:** Create tenant isolation test file for Documents  
**Goal:** Integration tests must verify that document list, by-ID operations, confirm, and cancel are tenant-scoped.  
**Target files/areas:** `tests/integration/api/tenant-isolation/documents.test.ts` — new file  
**Preconditions:** R1-05, R1-06, R1-07, R1-08, R1-09, R1-10 all DONE  
**Implementation boundary:** Create one new test file. Tests must use two distinct tenants. Do not modify existing tests or document handlers.  
**Verification:** Run new test file. All 6 scenarios must pass: (1) GET list, (2) GET by ID 404, (3) PUT 404, (4) DELETE 404, (5) confirm 404, (6) cancel 404. Full integration suite passes.  
**Completion signal:** 6 passing tests; no regressions.  
**Failure signal:** Any test fails; confirms a gap not addressed by R1 tasks.

---

### R3-03

**Title:** Create tenant isolation test file for Counterparties  
**Goal:** Integration tests must verify that counterparty list and by-ID operations are tenant-scoped.  
**Target files/areas:** `tests/integration/api/tenant-isolation/counterparties.test.ts` — new file  
**Preconditions:** R1-11 and R1-12 DONE  
**Implementation boundary:** Create one new test file. Tests must use two distinct tenants. Do not modify existing tests or counterparty handlers.  
**Verification:** Run new test file. Minimum 4 scenarios must pass: (1) GET list isolation, (2) GET by ID 404, (3) PUT 404, (4) DELETE 404. Full integration suite passes.  
**Completion signal:** Minimum 4 passing tests; no regressions.  
**Failure signal:** Any test fails; reveals a gap not closed by R1-11 or R1-12.

---

### R3-04

**Title:** Create migration gate automated test  
**Goal:** Automated integration tests must verify that each gate script exits 1 on NULL tenantId and exits 0 on clean data.  
**Target files/areas:** `tests/integration/migration-gates.test.ts` — new file  
**Preconditions:** R2-05 DONE  
**Implementation boundary:** Create one new test file. Tests must inject NULL values directly into the database, run gate scripts, check exit codes, and clean up. Do not modify gate scripts themselves.  
**Verification:** Tests pass: each gate exits 1 when NULL injected, exits 0 when data is clean. Full integration suite passes.  
**Completion signal:** 6 passing scenarios (3 gates × failure + success); no regressions.  
**Failure signal:** Gate script does not exit 1 on NULL injection; test cleanup leaves NULL rows in database.

---

### R3-05

**Title:** Integrate verification gate scripts into CI verification step  
**Goal:** All three gate scripts must be executed automatically in CI. A non-zero exit from any gate must fail the pipeline.  
**Target files/areas:** `.github/workflows/` — existing workflow file, OR `package.json` — scripts section  
**Preconditions:** R2-05 DONE; R3-04 DONE  
**Implementation boundary:** Add one CI step or one npm script. Do not restructure the CI pipeline or modify unrelated workflow steps.  
**Verification:** Introduce a NULL tenantId in the development database; trigger or simulate the CI step; confirm it fails. Remove the NULL; confirm the step passes.  
**Completion signal:** CI step fails on NULL tenantId and passes on clean data.  
**Failure signal:** CI step does not execute gates; CI step passes despite NULL tenantId.

---

### R4-01

**Title:** Audit all CompanySettings read paths  
**Goal:** Produce a confirmed list of all files and functions that read from `CompanySettings`.  
**Target files/areas:** `lib/modules/accounting/` — read only; `tests/helpers/factories/accounting.ts` — read only; `tests/integration/` — read only  
**Preconditions:** R3 Exit Gate confirmed  
**Implementation boundary:** Read files and identify references. No code changes in this task.  
**Verification:** A confirmed list of `CompanySettings` read sites exists. The list references specific files, function names, and line contexts. The list is complete — verified by searching the full codebase.  
**Completion signal:** Full inventory of `CompanySettings` read paths exists and is documented.  
**Failure signal:** Code changes are made during this task; the inventory is not verifiably complete.

---

### R4-02

**Title:** Redirect journal/accounting code from CompanySettings to TenantSettings  
**Goal:** All active code paths in `lib/modules/accounting/` must read from `TenantSettings`, not `CompanySettings`.  
**Target files/areas:** Files identified in R4-01 within `lib/modules/accounting/`  
**Preconditions:** R4-01 DONE  
**Implementation boundary:** Modify only the files listed in the R4-01 inventory within `lib/modules/accounting/`. Each replacement must resolve `TenantSettings` using available tenant context. If tenant context is absent at a call site, flag it as a secondary blocker — do not silently fallback to `CompanySettings`.  
**Verification:** Search codebase for `CompanySettings` references in `lib/modules/accounting/`. Zero references must remain. Run `npm run test:integration`.  
**Completion signal:** Zero `CompanySettings` references in `lib/modules/accounting/`; integration tests pass.  
**Failure signal:** Any `CompanySettings` read remains in accounting module; tests fail after replacement.

---

### R4-03

**Title:** Update test infrastructure to use TenantSettings  
**Goal:** `seedCompanySettings()` is replaced by a `TenantSettings`-based equivalent; all callers are updated.  
**Target files/areas:** `tests/helpers/factories/accounting.ts`; all test files calling `seedCompanySettings()`  
**Preconditions:** R4-02 DONE  
**Implementation boundary:** Replace `seedCompanySettings()` function and update all call sites. Do not modify other factory functions. Do not modify test assertions.  
**Verification:** Search codebase for `seedCompanySettings`. Zero references must remain. Run `npm run test:integration` — all tests that previously used `seedCompanySettings()` must still pass.  
**Completion signal:** Zero `seedCompanySettings` references; all previously passing tests still pass.  
**Failure signal:** Any reference to `seedCompanySettings` remains; any previously passing test now fails.

---

### R4-04

**Title:** Add tenantId to DocumentConfirmedEvent payload type  
**Goal:** `DocumentConfirmedEvent.payload.tenantId` is a required field in the TypeScript interface.  
**Target files/areas:** `lib/events/types.ts`  
**Preconditions:** R4-01 DONE  
**Implementation boundary:** Modify only the `DocumentConfirmedEvent` interface in `lib/events/types.ts`. Do not modify other event types in the same file. The change must cause TypeScript compile errors at all call sites that construct this event — those errors identify the R4-05 update targets.  
**Verification:** Run `npx tsc --noEmit`. Compile errors must appear at `DocumentConfirmed` construction sites that do not yet supply `tenantId`. No errors outside those expected sites.  
**Completion signal:** TypeScript interface updated; compile errors appear at emission sites; no unexpected errors elsewhere.  
**Failure signal:** No TypeScript errors appear (type change was not enforced); errors appear in unrelated files.

---

### R4-05

**Title:** Update DocumentConfirmed emission to include tenantId  
**Goal:** The `DocumentConfirmedEvent` emitted from the confirm service must include `tenantId` from the confirmed document.  
**Target files/areas:** `lib/modules/accounting/services/document-confirm.service.ts` — `createOutboxEvent` call site only  
**Preconditions:** R4-04 DONE  
**Implementation boundary:** Modify only the `createOutboxEvent` call that constructs `DocumentConfirmedEvent` in the confirm service. The `tenantId` must be sourced from the document record being confirmed, not from any runtime assumption. Do not modify other event emission sites.  
**Verification:** Run `npx tsc --noEmit` — zero compile errors. Run `npm run test:integration`. Optionally inspect the `OutboxEvent` table after a test confirm to verify `tenantId` appears in the stored payload JSON.  
**Completion signal:** Zero TypeScript errors; integration tests pass; `tenantId` is present in emitted payload.  
**Failure signal:** TypeScript errors remain; `tenantId` not present in stored payload; any test fails.

---

### R4-06

**Title:** Review test factory silent tenant creation  
**Goal:** Confirm whether implicit tenant creation in factories can produce false-positive cross-tenant test results.  
**Target files/areas:** `tests/helpers/factories/accounting.ts`; `tests/helpers/factories/auth.ts`  
**Preconditions:** R3 Exit Gate confirmed  
**Implementation boundary:** Review factory functions that call `createTenant()` when no `tenantId` is provided. Determine whether this behavior could cause tenant isolation tests in R3 to pass without actually testing isolation. If yes, update affected factories. If no, record the finding as confirmed-safe.  
**Verification:** The outcome is one of two states: (A) factory updated and R3 tests still pass, or (B) factories confirmed safe with written justification. In neither case may the R3 tests regress.  
**Completion signal:** Review complete; factories either corrected or confirmed safe; R3 tests still pass.  
**Failure signal:** Review deferred without conclusion; factories modified in a way that breaks R3 tests.

---

## 5. Phase Checkpoints

### R1 Checkpoint

**What must be true:**
- All 13 R1 tasks are in DONE or formally BLOCKED (R1-13 only) state
- Every handler in the R1 scope has a tenant predicate at the query level
- `confirmDocumentTransactional()` and `cancelDocumentTransactional()` accept and verify `tenantId`

**Evidence required:**
- Code review confirmation that all in-scope handlers apply tenant predicates
- `npm run test:integration` passes with no new failures
- R1-13 is either DONE with filter applied, or BLOCKED with formal blocker recorded

**Blocks transition to R2:**
- Any in-scope handler without a tenant predicate
- Any regression in the existing test suite
- R1-13 neither DONE nor formally BLOCKED

---

### R2 Checkpoint

**What must be true:**
- `_prisma_migrations` table exists in development database
- `prisma migrate status` reports zero pending migrations
- Migration files for `Product.tenantId` and `Document.tenantId` exist in `prisma/migrations/`
- All three gate scripts exit with code 0
- Rollback procedure document exists in `.qoder/specs/`

**Evidence required:**
- `prisma migrate status` output showing zero pending
- SQL query result: `SELECT COUNT(*) FROM "_prisma_migrations"` = total migration count
- Gate script execution output showing exit code 0 for all three
- Rollback document file path confirmed

**Blocks transition to R3:**
- Any pending migrations reported by `prisma migrate status`
- Any gate script exiting non-zero
- Rollback document absent

---

### R3 Checkpoint

**What must be true:**
- `tests/integration/api/tenant-isolation/` directory exists with three test files
- Minimum 14 tenant isolation integration tests exist and pass
- `tests/integration/migration-gates.test.ts` exists and passes
- CI gate verification step exists and behaves correctly (fail on NULL, pass on clean)

**Evidence required:**
- Test run output showing all tenant isolation and gate tests green
- CI step execution result: confirmed fail on injected NULL, confirmed pass on clean data
- `npm run test:integration` passes in full

**Blocks transition to R4:**
- Fewer than 14 tenant isolation tests
- Any tenant isolation test failing
- CI gate step absent or not working correctly

---

### R4 Checkpoint

**What must be true:**
- Zero `CompanySettings` references in active code paths (`lib/modules/accounting/`)
- Zero `seedCompanySettings` references in test infrastructure
- `DocumentConfirmedEvent.payload.tenantId` is populated at emission
- Zero TypeScript compile errors
- Test factories reviewed and confirmed safe or corrected

**Evidence required:**
- Codebase search for `CompanySettings` showing zero results in `lib/modules/accounting/`
- Codebase search for `seedCompanySettings` showing zero results
- `npx tsc --noEmit` exits 0
- `npm run test:integration` passes in full

**Blocks Recovery Program completion:**
- Any `CompanySettings` read in active code
- Any `seedCompanySettings` call in test infrastructure
- TypeScript compile errors
- Test regression introduced by R4 changes

---

## 6. Execution Stop Rules

Work must stop immediately — and must not resume until the condition is resolved — when any of the following occurs:

**STOP-01:** A verification gate script exits non-zero after the R2 baseline is established. Root cause must be identified. If root cause requires data remediation, remediation must complete before continuing.

**STOP-02:** `prisma migrate status` reports an unexpected state after any baseline or migration resolution step. The state must match the expected outcome before proceeding.

**STOP-03:** A tenant isolation test added in R3 fails after being expected to pass. This indicates either: (A) an R1 task was not completed correctly, or (B) the test logic is incorrect. In case A, work returns to the affected R1 task. In case B, the test must be corrected before the scenario can be marked covered.

**STOP-04:** A task cannot be completed without modifying files outside its Implementation Boundary. Scope expansion is not self-authorized. The blocker must be formally recorded and escalated using the Phase Escalation Rule defined in the Guardrails document.

**STOP-05:** `npm run test:integration` fails after any code change. The regression must be resolved before the next task begins. A failing test suite is not an acceptable state in which to start new work.

**STOP-06:** A TypeScript compile error appears in files outside the expected scope of a change. The unexpected error must be diagnosed. If it reveals an unintended side effect, the change must be revised.

**STOP-07:** An R4 change causes any previously passing R3 tenant isolation test to fail. This invalidates the R4 change. The change must be revised until R3 tests pass.

---

## 7. Progress Tracking Rules

**Task states:** Every task must be in exactly one of the following states at all times:

| State | Meaning |
|-------|---------|
| `NOT STARTED` | Task has not been initiated |
| `IN PROGRESS` | Task is actively being worked |
| `DONE` | Task has passed its Completion Signal |
| `BLOCKED` | Task cannot proceed; reason recorded |

**One task IN PROGRESS at a time.** No task may move to IN PROGRESS while another task is IN PROGRESS.

**BLOCKED state requires a reason.** A task marked BLOCKED must include: the blocking condition, the file or system involved, and whether the block affects the current phase's Done Criteria.

**DONE state requires evidence.** Evidence must be short and concrete. Acceptable evidence includes: test run output (pass/fail count), command exit code, file path confirmation, or search result showing zero matches. "It looks fine" is not acceptable evidence.

**No retroactive DONE.** A task may not be marked DONE for work that was done before this execution plan was in effect, unless the Verification step for that task is run now and passes.

---

## 8. Definition of Operational Completion

This execution plan is considered fully executed when all of the following are simultaneously true:

1. All 31 tasks (R1-01 through R4-06) are in DONE or formally BLOCKED state — with BLOCKED used only where explicitly permitted by the roadmap (R1-13 only, and only if the `Payment` model lacks `tenantId`)
2. All four Phase Checkpoints are confirmed
3. All Program Completion Criteria from the Recovery Roadmap (Section D, items 1 through 10) are simultaneously true
4. No Execution Stop Rule is in an active triggered state
5. `npm run test:integration` passes on the final state of the codebase
6. `prisma migrate status` reports zero pending migrations
7. `npx tsc --noEmit` exits 0
8. The three verification gate scripts all exit 0

When all eight conditions above are confirmed, the Recovery Program is operationally complete and the system is eligible for Phase 5 planning.

---

*End of ERP Recovery Execution Plan*

# ERP Recovery Program — Recovery Roadmap

**Document Status:** ACTIVE — CONTROLLING DOCUMENT  
**Authority:** Supersedes all informal task lists within the Recovery Program scope  
**Baseline Reference:** `.qoder/specs/erp-recovery-audit-baseline.md`  
**Scope:** Stabilization only — no feature work, no architectural expansion  

---

## A. Program Goal

The ERP Recovery Program is a **controlled stabilization track** that runs between the completion of Phase 4 (Hardening & Enforcement) and the start of any future Phase 5 platform work.

Its sole purpose is to close the four structural gaps identified in the frozen audit baseline:

1. Tenant isolation is not enforced at the API query layer
2. Database migration governance is broken and blocks safe production deploys
3. The automated test suite provides zero coverage for tenant isolation
4. Several dangerous transitional architecture patterns remain unresolved

The Recovery Program does not deliver new features. It delivers a system that is deployable, testable, and tenant-safe — the minimum preconditions for any continued development.

---

## B. Program Rules

The following rules apply to all work performed under this program. Violations invalidate the phase and require re-execution.

1. **No feature work.** No new user-facing functionality may be introduced during any recovery phase.

2. **No unrelated refactors.** Code changes are limited to the specific problem areas defined in each phase's In Scope section. Adjacent code that is not broken must not be touched.

3. **No architectural expansion.** No new models, no new modules, no new API endpoints beyond what is required to fix confirmed gaps.

4. **No schema experimentation.** Schema changes are limited to the migration recovery work defined in R2. No speculative schema changes are permitted.

5. **Strict sequential execution.** Phases must be executed in order: R1 → R2 → R3 → R4. No phase may begin until its predecessor has passed its Exit Gate.

6. **Audit baseline is frozen.** The problem inventory is fixed. If new issues are discovered during execution, they are recorded but not added to the current phase scope. They are evaluated for inclusion in a future phase or deferred to Phase 5.

7. **Every change must be traceable.** Each task must reference its task ID (e.g., R1-01) in the corresponding commit or pull request description.

---

## C. Phase Dependency Graph

```
R1 — Tenant Isolation Lockdown
        │
        ▼
R2 — Migration Governance Recovery
        │
        ▼
R3 — Tenant Test Shield
        │
        ▼
R4 — Minimal Architecture Cleanup
```

**Why this order is fixed:**

- **R1 before R2:** API handlers must be corrected first. R2 involves preparing for production deploy. Deploying before tenant isolation is enforced would expose the vulnerability in production.

- **R2 before R3:** Tests in R3 must run against the corrected handlers from R1. Additionally, R3 includes integrating verification gates into automated testing — those gates concern migration readiness, which is governed by R2. Tests written before migration governance is resolved may test against an incorrect baseline.

- **R3 before R4:** Architecture cleanup in R4 is validated by the test coverage established in R3. Without tenant isolation tests from R3, the cleanup changes in R4 cannot be verified as safe.

---

## D. Program Completion Criteria

The ERP Recovery Program is officially complete when all of the following are simultaneously true:

1. All R1 tasks have passed their Done Criteria
2. All R2 tasks have passed their Done Criteria
3. All R3 tasks have passed their Done Criteria
4. All R4 tasks have passed their Done Criteria
5. `prisma migrate status` reports zero pending migrations on the development database
6. `npm run test:integration` passes with all tenant isolation tests green
7. The three verification gate scripts exit with code 0 when run against the development database
8. `CompanySettings` is no longer referenced by any active code path — only `TenantSettings` is used
9. `DocumentConfirmedEvent` payload includes explicit `tenantId`
10. No critical or high risks from the audit baseline remain unresolved

At program completion, the system is eligible to enter Phase 5 planning.

---

## E. Deferred Work

The following items are explicitly **outside the scope of this Recovery Program**. They are recorded here to prevent scope creep and to document the intended handoff to Phase 5.

| Item | Reason for Deferral |
|------|---------------------|
| `TenantSettings` full migration to all code paths | Requires broader audit of all settings consumers; not a stabilization task |
| Outbox multi-tenant routing and tenant-partitioned event processing | Requires architectural design; blocked until tenant isolation baseline is stable |
| `documents.ts` shim removal | Shim is safe and low-risk; scheduled for Phase 5 cleanup |
| `Payment` model full tenant architecture | Requires schema change and data migration; beyond stabilization scope |
| Broader platform hardening (rate limiting per tenant, tenant quotas) | Phase 5 platform work |
| AI office / agent architecture integration | Phase 5 platform work |
| CRM Party / Counterparty relationship formalization | Phase 5 domain modelling work |
| E2E multi-tenant browser scenario coverage | Extends beyond the minimal test shield required for R3 |

---

---

## R1 — Tenant Isolation Lockdown

### Objective

Enforce tenant scoping on all confirmed-vulnerable API handlers so that no authenticated user can read or modify data belonging to a different tenant.

### Why This Phase Exists

The audit baseline (`Section 5: Confirmed Tenant Isolation Gaps`) documents that four modules contain handlers where `session.tenantId` is available but is not applied to database query `where` clauses. This is a systemic security gap. Every affected handler allows cross-tenant data access or mutation.

R1 closes this gap at the API handler layer for all confirmed cases.

### In Scope

- `app/api/accounting/products/route.ts` — GET list handler
- `app/api/accounting/products/[id]/route.ts` — GET, PUT, DELETE handlers
- `app/api/accounting/documents/route.ts` — GET list handler
- `app/api/accounting/documents/[id]/route.ts` — GET, PUT, DELETE handlers
- `app/api/accounting/documents/[id]/confirm/route.ts` — POST handler
- `app/api/accounting/documents/[id]/cancel/route.ts` — POST handler
- `app/api/accounting/counterparties/route.ts` — GET list handler
- `app/api/accounting/counterparties/[id]/route.ts` — GET, PUT, DELETE handlers
- `app/api/finance/payments/route.ts` — GET list handler (tenant filter only; full Payment model tenant architecture is deferred)
- `lib/modules/accounting/services/document-confirm.service.ts` — tenant context propagation to confirm/cancel service functions
- `lib/modules/accounting/services/document-confirm.service.ts` — cancel service function (`cancelDocumentTransactional`)

### Out of Scope

- Any API handler not explicitly listed above
- Schema changes to the `Payment` model
- Adding `tenantId` to the `Payment` table (deferred to Phase 5)
- Finance module beyond the GET list tenant filter
- Any CRM or ecommerce handlers
- Test changes (covered in R3)
- Migration files (covered in R2)

### Task List

**R1-01**  
**Title:** Add tenant filter to Products GET list  
**Target:** `app/api/accounting/products/route.ts`  
**Goal:** Apply `tenantId: session.tenantId` to the `where` clause in `GET /api/accounting/products`. The response must contain only products belonging to the authenticated user's tenant.  
**Dependency:** None

---

**R1-02**  
**Title:** Add tenant ownership check to Product GET by ID  
**Target:** `app/api/accounting/products/[id]/route.ts` — GET handler  
**Goal:** Replace `findUnique({ where: { id } })` with a query that includes `tenantId`. Return 404 when the product exists but belongs to a different tenant.  
**Dependency:** R1-01

---

**R1-03**  
**Title:** Add tenant ownership check to Product PUT  
**Target:** `app/api/accounting/products/[id]/route.ts` — PUT handler  
**Goal:** Verify product belongs to `session.tenantId` before executing the update. Return 404 if the product does not belong to the current tenant.  
**Dependency:** R1-02

---

**R1-04**  
**Title:** Add tenant ownership check to Product DELETE  
**Target:** `app/api/accounting/products/[id]/route.ts` — DELETE handler  
**Goal:** Verify product belongs to `session.tenantId` before executing the soft-delete. Return 404 if the product does not belong to the current tenant.  
**Dependency:** R1-02

---

**R1-05**  
**Title:** Add tenant filter to Documents GET list  
**Target:** `app/api/accounting/documents/route.ts`  
**Goal:** Apply `tenantId: session.tenantId` to the `where` clause in `GET /api/accounting/documents`. The response must contain only documents belonging to the authenticated user's tenant.  
**Dependency:** None

---

**R1-06**  
**Title:** Add tenant ownership check to Document GET by ID  
**Target:** `app/api/accounting/documents/[id]/route.ts` — GET handler  
**Goal:** Replace `findUnique({ where: { id } })` with a query that includes `tenantId`. Return 404 when the document belongs to a different tenant.  
**Dependency:** R1-05

---

**R1-07**  
**Title:** Add tenant ownership check to Document PUT  
**Target:** `app/api/accounting/documents/[id]/route.ts` — PUT handler  
**Goal:** Verify document belongs to `session.tenantId` before executing the update. Return 404 if ownership check fails.  
**Dependency:** R1-06

---

**R1-08**  
**Title:** Add tenant ownership check to Document DELETE  
**Target:** `app/api/accounting/documents/[id]/route.ts` — DELETE handler  
**Goal:** Verify document belongs to `session.tenantId` before executing the delete. Return 404 if ownership check fails.  
**Dependency:** R1-06

---

**R1-09**  
**Title:** Propagate tenantId to document confirm service  
**Target:** `app/api/accounting/documents/[id]/confirm/route.ts`, `lib/modules/accounting/services/document-confirm.service.ts`  
**Goal:** Pass `session.tenantId` from the API handler to `confirmDocumentTransactional()`. The service must verify the document belongs to the provided tenant before executing confirmation.  
**Dependency:** R1-06

---

**R1-10**  
**Title:** Propagate tenantId to document cancel service  
**Target:** `app/api/accounting/documents/[id]/cancel/route.ts`, `lib/modules/accounting/services/document-confirm.service.ts`  
**Goal:** Pass `session.tenantId` from the API handler to `cancelDocumentTransactional()`. The service must verify the document belongs to the provided tenant before executing cancellation.  
**Dependency:** R1-06

---

**R1-11**  
**Title:** Add tenant filter to Counterparties GET list  
**Target:** `app/api/accounting/counterparties/route.ts`  
**Goal:** Apply `tenantId: session.tenantId` to the `where` clause in `GET /api/accounting/counterparties`.  
**Dependency:** None

---

**R1-12**  
**Title:** Add tenant ownership checks to Counterparty GET/PUT/DELETE by ID  
**Target:** `app/api/accounting/counterparties/[id]/route.ts`  
**Goal:** Apply tenant ownership verification to all three handlers. Return 404 when the counterparty belongs to a different tenant.  
**Dependency:** R1-11

---

**R1-13**  
**Title:** Add tenant filter to Finance Payments GET list  
**Target:** `app/api/finance/payments/route.ts` — GET handler only  
**Goal:** Apply `tenantId: session.tenantId` to the `where` clause. Note: the `Payment` model may not have a `tenantId` column. If absent, this task must document the gap and mark itself as blocked pending R2/Phase 5 resolution. This task must not add a `tenantId` column to `Payment` — schema changes are out of scope for R1.  
**Dependency:** None

---

### Done Criteria

- [ ] All 8 product handler gaps listed in audit baseline section 5.1 are closed
- [ ] All 6 document handler gaps listed in audit baseline section 5.2 are closed
- [ ] Document confirm and cancel service functions receive and verify `tenantId`
- [ ] All 4 counterparty handler gaps listed in audit baseline section 5.3 are closed
- [ ] Finance GET list either applies tenant filter or formally documents a model-level blocker
- [ ] No handler returns data from a tenant other than `session.tenantId`
- [ ] Existing integration tests continue to pass (no regressions introduced)

### Exit Gate

R2 may not begin until:
1. All R1 Done Criteria are met
2. A code review has confirmed tenant predicate is applied consistently in all modified handlers
3. `npm run test:integration` passes

---

---

## R2 — Migration Governance Recovery

### Objective

Restore a valid, auditable migration history so that production deploys using `prisma migrate deploy` will succeed, and all future schema changes follow a governed migration discipline.

### Why This Phase Exists

The audit baseline (`Section 3: Database Governance Status`) documents that:

- The `_prisma_migrations` table does not exist in the database
- 12 migration files exist on disk but are untracked by Prisma
- `prisma migrate deploy` will fail with P3005 on first production use
- No migration files exist for `Product.tenantId` and `Document.tenantId`

Without resolving migration governance, any production deploy that uses the standard Prisma migration workflow will fail. The system cannot be considered deploy-ready until this is resolved.

### In Scope

- Establishing the migration baseline on the development database (marking all 12 existing migrations as applied)
- Creating missing migration files for `Product.tenantId`
- Creating missing migration files for `Document.tenantId`
- Verifying `prisma migrate status` reports zero pending migrations after baseline
- Documenting the rollback procedure for the tenant migration series
- Verifying all three verification gate scripts pass against the current database state

### Out of Scope

- Any schema changes not related to the missing migration files
- Adding new columns, tables, or indexes beyond what is required to match existing schema.prisma
- `Payment` model tenant column (deferred)
- `TenantSettings` vs `CompanySettings` schema resolution (addressed in R4)
- CI/CD pipeline integration of gates (addressed in R3)

### Task List

**R2-01**  
**Title:** Audit current migration file inventory  
**Target:** `prisma/migrations/` directory  
**Goal:** Enumerate all 12 migration files, verify their content matches the current database schema, and confirm which migrations represent already-applied changes. Produce a verified list of migrations to be marked `--applied`.  
**Dependency:** None

---

**R2-02**  
**Title:** Establish migration baseline on development database  
**Target:** `prisma/migrations/`, development database  
**Goal:** Run `prisma migrate resolve --applied` for each of the 12 existing migrations in order. After completion, `prisma migrate status` must report zero pending migrations and the `_prisma_migrations` table must exist with 12 rows.  
**Dependency:** R2-01

---

**R2-03**  
**Title:** Create missing migration file for Product.tenantId  
**Target:** `prisma/migrations/`  
**Goal:** Create a migration file that represents the `Product.tenantId` column addition as a no-op migration (the column already exists in the database). The migration file must accurately reflect the historical schema change and be safe to apply on a database where the column already exists (idempotent or pre-checked).  
**Dependency:** R2-02

---

**R2-04**  
**Title:** Create missing migration file for Document.tenantId  
**Target:** `prisma/migrations/`  
**Goal:** Create a migration file that represents the `Document.tenantId` column addition, following the same approach as R2-03. The file must be safe to apply on a database where the column already exists.  
**Dependency:** R2-02

---

**R2-05**  
**Title:** Run verification gates against development database  
**Target:** `scripts/verify-product-tenant-gate.ts`, `scripts/verify-document-tenant-gate.ts`, `scripts/verify-counterparty-tenant-gate.ts`  
**Goal:** Execute all three verification gate scripts manually against the development database. All three must exit with code 0. Document the output.  
**Dependency:** R2-02, R2-03, R2-04

---

**R2-06**  
**Title:** Document rollback procedure for tenant migrations  
**Target:** `.qoder/specs/` — new document  
**Goal:** Create a concise runbook describing the rollback steps for each tenant migration (Warehouse, Counterparty, Product, Document). This document must describe what a rollback requires in terms of data, schema state, and re-seeding. This is the only documentation artifact permitted in R2.  
**Dependency:** R2-02

---

**R2-07**  
**Title:** Verify prisma migrate status on development  
**Target:** Development database  
**Goal:** After R2-02 through R2-04, run `prisma migrate status`. The output must show all migrations as applied and zero pending migrations. This is a verification step, not an implementation step.  
**Dependency:** R2-03, R2-04

---

### Done Criteria

- [ ] `_prisma_migrations` table exists in the development database with all expected rows
- [ ] `prisma migrate status` reports zero pending migrations
- [ ] Missing migration files for `Product.tenantId` and `Document.tenantId` exist in `prisma/migrations/`
- [ ] All three verification gate scripts exit with code 0
- [ ] A rollback procedure document exists in `.qoder/specs/`
- [ ] `prisma generate` runs without errors after the baseline is established

### Exit Gate

R3 may not begin until:
1. All R2 Done Criteria are met
2. `prisma migrate status` is confirmed to show zero pending migrations on development
3. Verification gates all exit 0

---

---

## R3 — Tenant Test Shield

### Objective

Build the minimum automated test coverage required to detect tenant isolation regressions and to verify that R1 fixes function correctly and remain correct under future changes.

### Why This Phase Exists

The audit baseline (`Section 7: Test Coverage Status`) documents that across 312 tests, zero tests verify:

- Cross-tenant data access rejection
- Tenant-scoped list filtering
- Tenant ownership verification on by-ID operations
- Migration gate pass/fail behavior

Without this coverage, any regression in tenant isolation — whether introduced now or in the future — will be invisible to the automated test suite. R1 fixes are only as reliable as the tests that protect them.

### In Scope

- Integration tests for tenant-scoped GET list endpoints (products, documents, counterparties)
- Integration tests for cross-tenant access rejection on GET/PUT/DELETE by ID (products, documents, counterparties)
- Integration tests for cross-tenant rejection on document confirm and cancel
- Integration tests verifying migration gate failure conditions (NULL tenantId presence triggers gate exit 1)
- Integration of all three verification gate scripts into `npm run test:integration` or a dedicated CI verification step

### Out of Scope

- General test refactoring
- Unit test additions beyond tenant isolation scenarios
- E2E multi-tenant browser scenario tests (deferred)
- Coverage improvements for non-tenant-related functionality
- Finance/Payment tenant isolation tests (Payment model is not tenant-aware; test coverage cannot precede the schema fix)
- CSRF protection tests
- Performance tests

### Task List

**R3-01**  
**Title:** Create tenant isolation test file for Products  
**Target:** `tests/integration/api/tenant-isolation/products.test.ts`  
**Goal:** Implement integration tests covering: (1) GET list returns only current tenant's products and excludes other tenants'; (2) GET by ID returns 404 for other tenant's product; (3) PUT returns 404 for other tenant's product; (4) DELETE returns 404 for other tenant's product. All tests must use two distinct tenants with data in both.  
**Dependency:** R1-01 through R1-04 complete

---

**R3-02**  
**Title:** Create tenant isolation test file for Documents  
**Target:** `tests/integration/api/tenant-isolation/documents.test.ts`  
**Goal:** Implement integration tests covering: (1) GET list returns only current tenant's documents; (2) GET by ID returns 404 for other tenant's document; (3) PUT returns 404 for other tenant's document; (4) DELETE returns 404 for other tenant's document; (5) POST confirm returns 404 for other tenant's document; (6) POST cancel returns 404 for other tenant's document.  
**Dependency:** R1-05 through R1-10 complete

---

**R3-03**  
**Title:** Create tenant isolation test file for Counterparties  
**Target:** `tests/integration/api/tenant-isolation/counterparties.test.ts`  
**Goal:** Implement integration tests covering: (1) GET list returns only current tenant's counterparties; (2) GET/PUT/DELETE by ID returns 404 for other tenant's counterparty.  
**Dependency:** R1-11 through R1-12 complete

---

**R3-04**  
**Title:** Create migration gate automated test  
**Target:** `tests/integration/migration-gates.test.ts`  
**Goal:** Implement integration tests that verify: (1) the product tenant gate script exits 1 when a Product row has NULL tenantId; (2) the document tenant gate script exits 1 when a Document row has NULL tenantId; (3) the counterparty tenant gate script exits 1 when a Counterparty row has NULL tenantId; (4) all three gate scripts exit 0 when no NULL values are present. Tests must inject NULL values directly and then clean up.  
**Dependency:** R2-05 complete

---

**R3-05**  
**Title:** Integrate verification gate scripts into CI verification step  
**Target:** `.github/workflows/` or `package.json` scripts section  
**Goal:** Add a CI step or npm script that runs all three verification gate scripts (`verify-product-tenant-gate.ts`, `verify-document-tenant-gate.ts`, `verify-counterparty-tenant-gate.ts`) as part of the automated verification pipeline. The step must fail the pipeline if any gate exits non-zero.  
**Dependency:** R2-05, R3-04 complete

---

### Done Criteria

- [ ] `tests/integration/api/tenant-isolation/` directory exists with test files for products, documents, and counterparties
- [ ] All cross-tenant rejection tests pass for products (4 scenarios minimum)
- [ ] All cross-tenant rejection tests pass for documents (6 scenarios minimum, including confirm and cancel)
- [ ] All cross-tenant rejection tests pass for counterparties (4 scenarios minimum)
- [ ] Migration gate failure and success scenarios are covered by automated tests
- [ ] Verification gates are integrated into an automated verification step that fails on non-zero exit
- [ ] `npm run test:integration` passes entirely with all new tests green

### Exit Gate

R4 may not begin until:
1. All R3 Done Criteria are met
2. Total count of tenant isolation integration tests is at minimum 14 (covering all R3-01 through R3-03 scenarios)
3. The CI gate verification step is confirmed to fail when a NULL tenantId is introduced and pass when removed

---

---

## R4 — Minimal Architecture Cleanup

### Objective

Resolve the dangerous transitional architecture patterns identified in the audit baseline that remain active and pose ongoing operational risk.

### Why This Phase Exists

The audit baseline (`Section 8: Transitional Architecture Patterns`) identifies four active patterns. Two are classified as dangerous:

1. `CompanySettings` alongside `TenantSettings` — parallel settings system where it is not deterministic which table a given code path reads, creating undefined configuration behavior in multi-tenant scenarios.

2. Outbox events (`DocumentConfirmedEvent`) without explicit `tenantId` in their payloads — event handlers cannot resolve tenant context without a secondary database query; if the source document is deleted before processing, tenant context is permanently lost.

The third pattern (test factory ambiguity — factories that create tenants silently without caller awareness) creates test isolation risks that could produce false-positive passes in the tenant test shield established in R3.

R4 resolves these three patterns. It does not perform large-scale cleanup.

### In Scope

- Determining the authoritative settings table (`TenantSettings`) and redirecting all code paths that currently read from `CompanySettings` to use `TenantSettings`
- Removing `CompanySettings` reads from journal, accounting, and test infrastructure — not the table itself unless it is confirmed to be unreferenced
- Adding `tenantId` to `DocumentConfirmedEvent` payload in `lib/events/types.ts`
- Updating `createOutboxEvent` call sites that emit `DocumentConfirmed` to include `tenantId` in the payload
- Reviewing test factories in `tests/helpers/factories/accounting.ts` for silent tenant creation patterns that could mask cross-tenant test failures

### Out of Scope

- Removing the `documents.ts` backward-compatibility shim (classified as low-risk; deferred to Phase 5)
- Dropping the `CompanySettings` database table (schema change; requires separate migration discipline)
- Redesigning the outbox event schema beyond adding `tenantId` to `DocumentConfirmedEvent`
- Adding `tenantId` to all other event types (`product.updated`, `sale_price.updated`, `discount.updated`) — deferred to Phase 5 outbox evolution
- Any modifications to the `Payment` model
- Any CRM or ecommerce changes

### Task List

**R4-01**  
**Title:** Audit all CompanySettings read paths  
**Target:** `lib/modules/accounting/`, `tests/helpers/factories/accounting.ts`, `tests/integration/`  
**Goal:** Identify every code path that reads from the `CompanySettings` table. Produce a confirmed list of files and functions that must be redirected to `TenantSettings`. This is an audit step — no code changes.  
**Dependency:** R3 complete

---

**R4-02**  
**Title:** Redirect journal/accounting code from CompanySettings to TenantSettings  
**Target:** Files identified in R4-01 within `lib/modules/accounting/`  
**Goal:** Replace all `CompanySettings` reads in the journal and accounting service layer with `TenantSettings` reads. The `TenantSettings` record must be resolved using the tenant context available at the call site. If no tenant context is available at a given call site, that call site must be flagged as a secondary blocker.  
**Dependency:** R4-01

---

**R4-03**  
**Title:** Update test infrastructure to use TenantSettings  
**Target:** `tests/helpers/factories/accounting.ts` — `seedCompanySettings()` function  
**Goal:** Replace the `seedCompanySettings()` factory with a `seedTenantSettings()` equivalent that seeds a `TenantSettings` record for the test tenant. Update all test files that call `seedCompanySettings()` to use the new function.  
**Dependency:** R4-02

---

**R4-04**  
**Title:** Add tenantId to DocumentConfirmedEvent payload type  
**Target:** `lib/events/types.ts`  
**Goal:** Add `tenantId: string` as a required field on the `DocumentConfirmedEvent` payload interface. This change must be non-breaking at the type level — all call sites that construct this event must be updated.  
**Dependency:** R4-01

---

**R4-05**  
**Title:** Update DocumentConfirmed emission to include tenantId  
**Target:** `lib/modules/accounting/services/document-confirm.service.ts`  
**Goal:** Pass `tenantId` from the document record into the `DocumentConfirmedEvent` payload at the point of event creation. After this task, the emitted event payload must contain the `tenantId` of the confirmed document.  
**Dependency:** R4-04

---

**R4-06**  
**Title:** Review test factory silent tenant creation  
**Target:** `tests/helpers/factories/accounting.ts`, `tests/helpers/factories/auth.ts`  
**Goal:** Review all factory functions that create tenant records implicitly (e.g., `createProduct()` calling `createTenant()` when no `tenantId` is provided). Determine whether this pattern can produce false-positive results in the tenant isolation tests established in R3. If it can, update the factories to require explicit `tenantId` or to generate a deterministic tenant ID that is visible to the test.  
**Dependency:** R3 complete

---

### Done Criteria

- [ ] No active code path in `lib/modules/accounting/` reads from `CompanySettings`
- [ ] `seedCompanySettings()` is replaced by a `TenantSettings`-based equivalent in test infrastructure
- [ ] All integration tests that previously called `seedCompanySettings()` have been updated and pass
- [ ] `DocumentConfirmedEvent.payload.tenantId` is a required field and is populated at emission
- [ ] No TypeScript compile errors introduced by the type change in R4-04
- [ ] Test factory silent tenant creation is reviewed and either documented as safe or corrected
- [ ] `npm run test:integration` passes entirely after all R4 changes

### Exit Gate

The Recovery Program is complete when:
1. All R4 Done Criteria are met
2. All Program Completion Criteria defined in Section D are simultaneously true
3. The system is confirmed tenant-safe, migration-governed, test-protected, and architecturally consistent with the four recovery objectives

---

*End of ERP Recovery Roadmap*

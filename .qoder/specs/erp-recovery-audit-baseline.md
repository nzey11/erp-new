# ERP Recovery Program — Audit Baseline

**Document Status:** FROZEN BASELINE — DO NOT MODIFY  
**Frozen As Of:** Phase 4 completion (Phase P4-03)  
**Purpose:** Factual snapshot of system state before the ERP Recovery Program begins  

---

## 1. Executive Summary

ListOpt ERP has completed normalization phases P1 through P4. These phases delivered significant architectural improvements: document state machine, outbox event durability, tenant model introduction, CRM Party architecture, and domain boundary separation.

However, deep technical audits conducted at the end of Phase 4 revealed a set of structural gaps that were not addressed during normalization:

1. **Tenant isolation is architecturally incomplete.** The `tenantId` column exists on primary entities, but API handlers do not uniformly enforce tenant scoping in queries. This means a user from Tenant A can potentially read and modify data belonging to Tenant B.

2. **Database migration governance is broken.** The production database was created using `prisma db push`, not `prisma migrate deploy`. As a result, the `_prisma_migrations` table does not exist, and 12 migrations in `prisma/migrations/` are classified as pending despite the schema being functionally current. Any production deploy using `prisma migrate deploy` will fail without a baseline resolution step.

3. **Test coverage has zero tenant isolation tests.** Across 312 tests (unit + integration + e2e), no test verifies cross-tenant access rejection or tenant-scoped data visibility. Tenant isolation vulnerabilities are invisible to the automated test suite.

4. **Several transitional architectural patterns remain active.** These include a backward-compatibility shim in `documents.ts`, a parallel settings system (`CompanySettings` alongside `TenantSettings`), and domain events missing explicit `tenantId` in their payloads.

The Recovery Program exists to resolve these gaps in a controlled, evidence-based sequence before any new feature development resumes.

---

## 2. System State Snapshot

### 2.1 Modular Structure

The system is a **Next.js modular monolith** organized around four top-level domains:

| Domain | Location | Status |
|--------|----------|--------|
| `accounting` | `app/(accounting)/`, `app/api/accounting/`, `lib/modules/accounting/` | Active, primary domain |
| `finance` | `app/(finance)/`, `app/api/finance/` | Active, partially scoped |
| `ecommerce` | `app/store/`, `app/api/ecommerce/` | Active, separate tenant model |
| `crm` | `app/(accounting)/crm/`, `lib/crm/`, `lib/party/` | Active, Party model present |
| `integrations` | `app/api/integrations/` | Active, Telegram auth |

Business logic resides in `lib/modules/{domain}/`. API handlers in `app/api/{domain}/`. UI components in `components/{domain}/`.

### 2.2 Event / Outbox Architecture

The system uses a **transactional outbox pattern** for durable domain event delivery.

- **Outbox table:** `OutboxEvent` in PostgreSQL
- **Event types defined:** `DocumentConfirmed`, `product.updated`, `sale_price.updated`, `discount.updated`  
  (see `lib/events/types.ts`)
- **Event creation:** `createOutboxEvent()` in `lib/events/outbox.ts` — writes atomically within the same database transaction as the business operation
- **Processing:** Background worker reads PENDING events, calls registered handlers, marks PROCESSED or retries on failure (max 5 attempts, then DEAD)
- **Current anchor event:** `DocumentConfirmed` — emitted from `document-confirm.service.ts` on every document confirmation

### 2.3 Document State Machine

The document state machine is implemented in `lib/modules/accounting/services/document-states.ts`.

**Valid states:** `draft` → `confirmed` → `cancelled` / `shipped` → `delivered`

**State machine characteristics:**
- Transitions are validated before any mutation
- `DocumentStateError` is thrown on illegal transitions
- State transitions are structural-only (no side effects in the state machine itself)
- Confirm and cancel operations are handled by `document-confirm.service.ts` which calls the state machine before executing business logic

### 2.4 Authentication and Tenant Session Model

Authentication uses a custom HMAC-SHA256 session token:

- **Token format:** `userId|expiresAt.signature`
- **Session cookie:** `session_token` (HttpOnly)
- **CSRF protection:** `csrf_token` cookie + `X-CSRF-Token` header for mutating requests
- **Session resolution:** `getAuthSession()` in `lib/shared/auth.ts` — reads session cookie, validates token, queries `User` and `TenantMembership` tables
- **Tenant resolution:** Session carries `tenantId`, `tenantName`, `tenantSlug`, `membershipId`
- **RBAC:** Role-based via `ErpRole` enum (`admin`, `operator`, `viewer`) — checked via `requirePermission()` in `lib/shared/authorization.ts`

The session object is the authoritative source of `tenantId` for all API request handling.

---

## 3. Database Governance Status

### 3.1 Migration History

The production and development database was created using `prisma db push`, not `prisma migrate deploy`.

**Consequence:** The `_prisma_migrations` table does not exist in the database.

```sql
-- forensic-audit.ts result:
-- SELECT * FROM "_prisma_migrations" LIMIT 1
-- ERROR: relation "_prisma_migrations" does not exist
```

### 3.2 Pending Migrations

`prisma migrate status` reports **12 pending migrations** because Prisma cannot find the `_prisma_migrations` table to verify which migrations have been applied.

The migrations exist on disk in `prisma/migrations/` but their apply status is unknown to Prisma:

| Migration | Phase | Expected Status |
|-----------|-------|-----------------|
| `20260313_add_warehouse_tenantId` | Single-phase ADD+BACKFILL+NOT NULL | Applied via db push |
| `20260314_add_counterparty_tenant` | Two-phase Phase 1 (nullable) | Applied via db push |
| `20260314_add_counterparty_tenant_not_null` | Two-phase Phase 2 (NOT NULL) | Applied via db push |
| Additional 9 migrations | Various | Applied via db push |

### 3.3 Schema State

The current `schema.prisma` declares `tenantId String` (NOT NULL, required) on:
- `Product`
- `Document`
- `Counterparty`
- `Warehouse`

Forensic SQL verification confirms these columns exist in the database with `is_nullable: "NO"` and no NULL values. The schema and database are currently aligned.

### 3.4 Deploy Risks

| Risk | Description |
|------|-------------|
| **P3005 on migrate deploy** | Running `prisma migrate deploy` on production will fail with error P3005 because `_prisma_migrations` table does not exist |
| **Missing baseline** | Before any production deploy using migration-based workflow, all 12 migrations must be marked `--applied` via `prisma migrate resolve --applied` |
| **No rollback playbook** | No documented rollback procedure exists for the tenant migration series |
| **Missing Product/Document migrations** | Despite `schema.prisma` declaring `tenantId String` on Product and Document, the corresponding migration files have not been created |

---

## 4. Tenant Architecture Status

### 4.1 Tenant Model

The multi-tenant model uses **row-level tenantId** columns. There is no schema-level row security.

**Tenant entities:**
- `Tenant` — root tenant record (id, name, slug, isActive)
- `TenantMembership` — user-to-tenant membership (userId, tenantId, role, isActive)
- `TenantSettings` — per-tenant settings (tax regime, currency, defaults)

**Tenant-scoped entities:**
- `Product` — `tenantId String` (NOT NULL), FK to `Tenant`
- `Document` — `tenantId String` (NOT NULL), FK to `Tenant`
- `Counterparty` — `tenantId String` (NOT NULL), FK to `Tenant`
- `Warehouse` — `tenantId String` (NOT NULL), FK to `Tenant`

### 4.2 Foreign Key Constraints

All four tenant-scoped entities have foreign key constraints from `tenantId` to `Tenant.id`. These constraints are enforced at the database level.

### 4.3 Tenant-Aware Session

The session object (`AuthSession`) carries `tenantId` as a field. API handlers retrieve the session via `getAuthSession()` and have access to `session.tenantId` for query scoping.

### 4.4 API Enforcement Weaknesses

The session provides `tenantId`, but individual API handlers do not consistently apply it to database queries. The following pattern of omission is confirmed across multiple handlers:

```typescript
// Pattern: session is retrieved but tenantId is NOT added to where clause
const session = await getAuthSession();
const items = await db.product.findMany({
  where: {
    // tenantId: session.tenantId  ← MISSING
  }
});
```

This is a systematic omission, not a single bug.

---

## 5. Confirmed Tenant Isolation Gaps

The following vulnerabilities were confirmed during the Phase 4 audit by reading the actual handler source files.

### 5.1 Products

**File:** `app/api/accounting/products/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/accounting/products` | `where` clause built without `tenantId`. Returns ALL products across ALL tenants. |
| `POST /api/accounting/products` | Creates product with `tenantId` from session. **No gap on create.** |

**File:** `app/api/accounting/products/[id]/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/accounting/products/[id]` | `db.product.findUnique({ where: { id } })` — no tenant check. Returns any product by ID regardless of tenant. |
| `PUT /api/accounting/products/[id]` | `tx.product.update({ where: { id } })` — no tenant verification. Updates any product. |
| `DELETE /api/accounting/products/[id]` | `tx.product.update({ where: { id } })` — no tenant verification. Soft-deletes any product. |

**Pattern:** GET list returns cross-tenant data. GET/PUT/DELETE by ID lack tenant ownership verification.

---

### 5.2 Documents

**File:** `app/api/accounting/documents/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/accounting/documents` | `where` clause built without `tenantId`. Returns ALL documents across ALL tenants. |

**File:** `app/api/accounting/documents/[id]/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/accounting/documents/[id]` | `db.document.findUnique({ where: { id } })` — no tenant check. |
| `PUT /api/accounting/documents/[id]` | Status check and update performed without tenant verification. |
| `DELETE /api/accounting/documents/[id]` | Delete performed without tenant verification. |

**File:** `app/api/accounting/documents/[id]/confirm/route.ts`

| Handler | Gap |
|---------|-----|
| `POST /api/accounting/documents/[id]/confirm` | Calls `confirmDocumentTransactional(id, actor)`. The service receives only the document ID and actor string. No `tenantId` is passed. The service calls `db.document.findUnique({ where: { id } })` without tenant scoping. |

**File:** `app/api/accounting/documents/[id]/cancel/route.ts`

| Handler | Gap |
|---------|-----|
| `POST /api/accounting/documents/[id]/cancel` | Same pattern as confirm. `cancelDocumentTransactional(id, actor)` — no tenant passed. |

**Pattern:** All document operations — including financial state transitions (confirm, cancel) — lack tenant ownership verification.

---

### 5.3 Counterparties

**File:** `app/api/accounting/counterparties/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/accounting/counterparties` | `where` clause built without `tenantId`. |

**File:** `app/api/accounting/counterparties/[id]/route.ts`

| Handler | Gap |
|---------|-----|
| `GET`, `PUT`, `DELETE` | No tenant verification on read/write/delete by ID. |

---

### 5.4 Finance / Payments

**File:** `app/api/finance/payments/route.ts`

| Handler | Gap |
|---------|-----|
| `GET /api/finance/payments` | No tenant filter in `where` clause. |
| `POST /api/finance/payments` | Payment created without `tenantId`. The `Payment` model does not have a `tenantId` column — this entity is not tenant-aware. |

**Pattern:** The Finance module is entirely outside the tenant architecture. The `Payment` model has no `tenantId` column, meaning financial records are not isolated by tenant at any level.

---

## 6. Migration Safety Status

### 6.1 Missing Migration Provenance

The database schema was evolved using `prisma db push`, which applies changes directly without recording migration history. This means:

- There is no audit trail of which schema changes were applied, when, and in what order
- It is not possible to determine the exact migration state without forensic SQL inspection
- Rollback to a previous schema state is not supported

### 6.2 Missing Migration Files

Despite `schema.prisma` declaring `Product.tenantId` and `Document.tenantId` as required (`String` without `?`), there are no migration files for these columns in `prisma/migrations/`. The columns exist in the database because they were created via `db push`, not via managed migrations.

**Entities with tenantId in schema but no migration file:**
- `Product.tenantId`
- `Document.tenantId`

### 6.3 Baseline Requirement

Before any production deploy using `prisma migrate deploy`, a baseline must be established:

```bash
# For each of the 12 migrations:
npx prisma migrate resolve --applied <migration_name>
```

This must be run on the production database before the first migration-based deploy. Without this step, `prisma migrate deploy` will fail with error P3005 (`The database schema is not empty`).

### 6.4 Verification Gate Status

Three verification gate scripts exist as standalone files:

| Script | Purpose | CI Integration |
|--------|---------|----------------|
| `scripts/verify-product-tenant-gate.ts` | Verify no NULL tenantId in Product | Not integrated |
| `scripts/verify-document-tenant-gate.ts` | Verify no NULL tenantId in Document | Not integrated |
| `scripts/verify-counterparty-tenant-gate.ts` | Verify no NULL tenantId in Counterparty | Not integrated |
| `scripts/audit-sku-distribution.ts` | Pre-migration SKU conflict check | Not integrated |

These scripts are available and functional but are not part of any automated CI/CD pipeline.

---

## 7. Test Coverage Status

### 7.1 Test Suite Composition

| Layer | Files | Tests (approx.) | Tenant Isolation Tests |
|-------|-------|-----------------|----------------------|
| Unit (`tests/unit/lib/`) | 17 files | ~151 | **0** |
| Integration (`tests/integration/`) | 13 files | ~141 | **0** |
| E2E (`tests/e2e/specs/`) | 5 files | ~20 | **0** |
| **Total** | **35 files** | **~312** | **0** |

### 7.2 What Is Covered

- Document state machine transitions
- Document confirm/cancel flow (single tenant, happy path)
- Journal entry creation and reversal guards
- Stock movements and COGS calculations
- Session token creation and validation
- Session lifecycle (user deleted, user deactivated, membership removed)
- Auth RBAC role enforcement (admin vs viewer vs operator)
- CSRF token generation (utilities only, no protection tests)
- CRM party merge and resolver
- Outbox event creation and retry logic (mocked)

### 7.3 What Is Not Covered

- **Cross-tenant data access rejection** — no test verifies that User A cannot access Tenant B's data
- **Tenant-scoped GET list filtering** — no test verifies that list endpoints return only current tenant's records
- **Tenant-scoped GET by ID ownership** — no test verifies 404 when accessing another tenant's resource by ID
- **Cross-tenant PUT/DELETE rejection** — no test verifies that mutations fail for other tenants' resources
- **Migration gate failure conditions** — no test verifies gates fail on NULL tenantId or duplicate SKUs
- **Finance/Payment tenant isolation** — no tests exist for tenant scoping in the finance module
- **Outbox events with tenant context** — no test verifies `tenantId` is present in event payloads

### 7.4 Verification Gates and CI

The verification gate scripts (`verify-*-gate.ts`) are manual execution scripts. They are not invoked by `npm test`, not part of any GitHub Actions workflow, and not part of the pre-push hooks. Their pass/fail status is not verified automatically at any point in the development or deployment pipeline.

---

## 8. Transitional Architecture Patterns

### 8.1 `documents.ts` Backward-Compatibility Shim

**File:** `lib/modules/accounting/documents.ts`

**Nature:** Explicitly marked as `BACKWARD-COMPATIBLE SHIM (Phase 1.4)` in its header comment.

**Function:** Re-exports domain predicates from their new canonical locations:
- Inventory predicates → `lib/modules/accounting/inventory/predicates.ts`
- Finance predicates → `lib/modules/accounting/finance/predicates.ts`

**Current Assessment:** Acceptable. The shim is transparent (pure re-export), causes no runtime divergence, and allows consumer code to be migrated incrementally. It does not introduce logical duplication or hidden state.

---

### 8.2 `CompanySettings` alongside `TenantSettings`

**Situation:** Both `CompanySettings` (legacy, global, no tenantId) and `TenantSettings` (current, per-tenant) exist as separate database tables.

**Evidence:**
- `prisma/seed-accounts.ts` creates a `CompanySettings` record via `createDefaultCompanySettings()`
- `tests/helpers/factories/accounting.ts` exports `seedCompanySettings()` used in accounting and journal tests
- `tests/e2e/fixtures/database.fixture.ts` truncates `TenantSettings` but does not truncate `CompanySettings`

**Current Assessment:** Dangerous. The presence of two parallel settings systems means different parts of the application may read different configuration. The journal and accounting tests use `CompanySettings`, which implies business logic in the journal module reads from the legacy table. It is not confirmed which code paths read from `TenantSettings` vs `CompanySettings`.

---

### 8.3 Counterparty → Party Side Effect

**Situation:** Creating a `Counterparty` triggers a side effect that creates or links a `Party` record (CRM domain). This coupling exists as a consequence of the Phase 3 CRM/Party normalization.

**Current Assessment:** Acceptable in current state. The side effect is intentional and is part of the documented Party architecture. The risk is that Counterparty operations carry implicit CRM dependencies that are not visible at the API level.

---

### 8.4 Outbox Events Without Explicit `tenantId`

**File:** `lib/events/types.ts`

**Situation:** The `DocumentConfirmedEvent` payload does not include `tenantId`:

```typescript
export interface DocumentConfirmedEvent {
  readonly type: "DocumentConfirmed";
  readonly payload: {
    readonly documentId: string;
    readonly documentType: DocumentType;
    readonly documentNumber: string;
    readonly counterpartyId: string | null;
    readonly warehouseId: string | null;
    readonly totalAmount: number;
    readonly confirmedAt: Date;
    readonly confirmedBy: string | null;
    // tenantId is ABSENT
  };
}
```

All other domain events (`product.updated`, `sale_price.updated`, `discount.updated`) contain only `productId` in their payloads.

**Current Assessment:** Dangerous for future multi-tenant outbox processing. An event handler processing `DocumentConfirmed` events must perform a secondary database query to resolve the tenant context. If the document is deleted between event emission and processing, the tenant context is permanently lost. This is not a current runtime failure, but it is a design gap that will become a blocker when tenant-scoped event processing is required.

---

## 9. Risk Classification

| Category | Risk Level | Description |
|----------|-----------|-------------|
| **Tenant isolation — GET list** | CRITICAL | All primary entity list endpoints return cross-tenant data. Any authenticated user can read all records. |
| **Tenant isolation — by-ID operations** | CRITICAL | GET/PUT/DELETE by ID do not verify tenant ownership. Cross-tenant modification is possible. |
| **Tenant isolation — document state transitions** | CRITICAL | Confirm and cancel operations on documents do not pass tenant context to the service layer. A user from Tenant A can confirm/cancel documents belonging to Tenant B. |
| **Finance module tenant gap** | CRITICAL | The `Payment` model has no `tenantId` column. Finance data is not isolated at any level. |
| **Migration governance failure** | HIGH | No `_prisma_migrations` table exists. Production deploy via `prisma migrate deploy` will fail with P3005 without prior baseline resolution. |
| **Missing Product/Document migrations** | HIGH | Migration files for `Product.tenantId` and `Document.tenantId` do not exist. The schema-to-migration mapping is incomplete. |
| **Zero tenant isolation tests** | HIGH | No automated test can detect a tenant isolation regression. Any fix applied to the codebase cannot be verified to be correct or complete through the test suite. |
| **Verification gates not in CI** | HIGH | Migration pre-conditions (`verify-*-gate.ts`) are manual scripts. A deploy could proceed even when gates would fail. |
| **Parallel settings system** | MEDIUM | `CompanySettings` and `TenantSettings` coexist. Business logic reads from the legacy table in at least journal/accounting paths. Tenant-aware configuration is not guaranteed. |
| **Outbox events missing tenantId** | MEDIUM | Domain events do not carry tenant context. Future tenant-scoped event handlers will require additional resolution logic or will fail silently. |
| **documents.ts shim** | LOW | Backward-compatible re-export shim. No runtime risk. Scheduled for removal after consumer migration is complete. |

---

## 10. Recovery Program Justification

The system reached Phase 4 with a functional core domain — document management, stock movements, COGS calculations, double-entry accounting, and CRM Party model all operate correctly within a single-tenant context.

However, the multi-tenant architecture that was introduced during Phases 3 and 4 was implemented at the schema and session layer without being enforced at the API query layer. This creates a structural gap: the infrastructure for tenant isolation exists, but the enforcement is absent.

A structured Recovery Program is required for the following reasons:

**1. The tenant isolation gap is systemic, not incidental.**  
The pattern of missing `tenantId` in `where` clauses appears across products, documents, counterparties, and finance. This is not a single oversight — it is an omission that spans multiple modules and multiple developers' contributions. Fixing it requires a coordinated sweep, not individual hotfixes.

**2. Migration governance must be established before the next deploy.**  
The absence of `_prisma_migrations` means the next production deploy via `prisma migrate deploy` will fail. Establishing the baseline and creating the missing migration files for Product and Document tenantId are prerequisites for any future schema change.

**3. Test coverage cannot validate tenant isolation fixes.**  
Any fix applied to API handlers to add tenant filtering cannot be verified as correct without corresponding tests. Adding the fixes without adding tests leaves the system in an untestable state. The test coverage gap must be closed in parallel with the code fixes.

**4. The parallel settings system creates undefined behavior.**  
While `CompanySettings` and `TenantSettings` coexist, it is not deterministic which settings a given code path reads. This ambiguity must be resolved before any multi-tenant scenarios are considered production-ready.

**5. The system is not ready for multi-tenant production load.**  
In its current state, a production system serving multiple tenants would expose all tenants' data to all authenticated users. This is a security-critical condition that blocks any multi-tenant deployment.

The Recovery Program addresses these issues in a controlled sequence, with each step producing a verifiable state change. The audit baseline frozen in this document serves as the measurable starting point against which all Recovery Program outcomes will be evaluated.

---

*End of Audit Baseline — ERP Recovery Program*

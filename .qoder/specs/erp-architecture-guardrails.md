# ERP Architecture Guardrails

> **Version:** 1.0  
> **Status:** ACTIVE — OPERATIONAL REFERENCE  
> **Companion document:** `.qoder/specs/erp-normalization-roadmap.md`  
> **Owner:** ERP System Architect

This document defines mandatory architectural guardrails for the ListOpt ERP codebase.  
It must be consulted before any of the following actions:
- adding a new feature
- refactoring an existing module
- creating a new route
- adding a new write path
- adding a new event handler
- adding a new projection
- creating or changing cross-module entity relationships

**If the roadmap and an implementation proposal conflict, the implementation must be corrected.**  
These guardrails complement the normalization roadmap — they do not replace it.

---

## 1. Purpose

This document exists to prevent architectural drift back into the patterns identified in the March 2026 architectural audit:

- route-level orchestration and inline business logic
- duplicated write paths for the same domain operation
- missing CRM/Party mirrors for created entities
- stale projections caused by missing event emission
- dead event infrastructure used as if it were live
- inconsistent module structure and god files
- tenant isolation leaks

It answers three operational questions for every structural change:

1. **Where does this code belong?**
2. **What patterns are allowed here?**
3. **What must be true when this work is done?**

---

## 2. Non-Negotiable Rules

These rules hold unconditionally. There are no exceptions without an explicit architecture decision recorded in the roadmap.

### Route Layer Rules

| Rule | Enforcement |
|------|------------|
| Routes may only: parse input, check permissions, call a service, map the response | Review gate |
| Routes must not import `db` or any Prisma client directly | ESLint rule (P4-04) |
| Routes must not contain business logic, state transitions, or calculations | Review gate |
| Routes must not call `db.$transaction()` | Review gate |
| Routes must not directly call projection update functions | Review gate |
| Routes must not directly call `resolveParty()` except as delegation to a service | Review gate |

### Service Layer Rules

| Rule | Enforcement |
|------|------------|
| Services own all write operations | Review gate |
| One business operation = one canonical service function | Review gate |
| Write operations affecting multiple tables must use `db.$transaction()` | Review gate |
| Side effects that cross module boundaries must be emitted as outbox events inside the transaction | Review gate |
| No service may duplicate the responsibility of another existing service | Review gate |

### Domain Layer Rules

| Rule | Enforcement |
|------|------------|
| Domain functions must be pure: zero DB imports, zero side effects | TypeScript + Review gate |
| State machines, transition validators, and business rules live in `domain/` | Review gate |
| Domain functions receive data, return typed results or typed errors | Review gate |

### Event Architecture Rules

| Rule | Enforcement |
|------|------------|
| The outbox is the sole production event delivery mechanism | Architecture rule + P2-06 |
| `IEventBus` is a test utility — not a production event path | Architecture rule |
| Outbox events must be written inside the same `db.$transaction()` as the triggering mutation | Review gate |
| Registering a handler only into `IEventBus` (not into outbox) is forbidden | Review gate |
| Adding a new event type requires updating `.qoder/specs/event-types.md` | Documentation gate |

### Projection Rules

| Rule | Enforcement |
|------|------------|
| Projections must be updated via outbox event handlers, not from routes | Review gate |
| Projection builder functions must be pure (no DB writes) | Review gate |
| Projection orchestrators must be idempotent | Review gate |
| Rebuild scripts are recovery tools, not primary update mechanisms | Architecture rule |

### Tenant Isolation Rules

| Rule | Enforcement |
|------|------------|
| `tenantId` must come from the authenticated session or a trusted server-side context | Review gate |
| `tenantId` must never be accepted from the HTTP request body | Review gate |
| Services must receive `tenantId` as an explicit parameter | Review gate |
| All tenant-bound entities must have `tenantId` set at creation time | Review gate + DB constraint (P4) |

### Identity / CRM Mirror Rules

| Rule | Enforcement |
|------|------------|
| Creating a `Counterparty` must atomically create a `Party` mirror | `createCounterpartyWithParty()` service (P1-02) |
| Creating a `Customer` must produce a `Party` mirror at creation time | `resolveParty()` in auth transaction (P2-04) |
| `resolveParty()` must be called inside the same `db.$transaction()` as the primary entity creation | Review gate |

---

## 3. Decision Rules: Where Should Code Live?

### If this is a route handler

**May do:**
- Import and call `requirePermission()` / `requireAuth()`
- Call `parseBody()` / `parseQuery()` for input validation
- Call one or more service functions
- Map service results to `NextResponse.json()`
- Call `handleAuthError()` or `validationError()` for error mapping

**May not do:**
- Import `db` or any Prisma model
- Call `db.$transaction()`, `db.*.create()`, `db.*.update()`, etc.
- Contain `if/else` business logic beyond error mapping
- Call domain functions (state machines) directly
- Call `resolveParty()`, `updateProductCatalogProjection()`, or any projection function directly
- Contain more than ~40 lines of logic

**Decision test:** If the route contains any logic that would need to be duplicated if the same operation were triggered by a webhook, a cron job, or another service — that logic belongs in a service.

---

### If this is a write operation

**Where it lives:** `lib/modules/<domain>/services/<operation>.service.ts`

**Transaction boundary:** At the service level. The service function is responsible for opening `db.$transaction()` and ensuring all writes that must be atomic are inside it.

**Outbox event placement:** The `createOutboxEvent(tx, ...)` call must be inside the same transaction as the mutation it annotates. It is never called after the transaction closes.

**Naming convention:** `<verb><Entity>[Context].service.ts`  
Examples: `counterparty.service.ts`, `document-confirm.service.ts`, `order-create.service.ts`

**If a canonical service already exists for this operation:** Use it. Do not create a second service for the same operation. Do not add the operation as an inline function in a route.

---

### If this is a pure business rule

**Where it lives:** `lib/modules/<domain>/domain/`

**Requirements:**
- No `import { db }` anywhere in the file
- No `async` function that performs I/O
- Inputs are plain TypeScript values or domain types
- Outputs are typed results or typed errors (discriminated unions preferred)
- No side effects

**Examples of pure domain logic:**
- `validateTransition(from, to)` — state machine
- `computeDiscountedPrice(price, discount)` — pricing rule
- `buildJournalEntries(document, postingRules)` — journal computation

---

### If this is a query or read operation

**Where it lives:** `lib/modules/<domain>/queries/<entity>.queries.ts`

**Requirements:**
- May import `db`
- Must not perform any write operations (`create`, `update`, `delete`, `upsert`)
- Must not call `db.$transaction()` for writes
- May call `db.$transaction()` only for read consistency if explicitly required

**Read operations must not live in services.** If a service needs to read data before writing, it calls a query function or reads inline — but the query logic should be extractable.

---

### If this is an event-driven side effect

**Emission:** The triggering mutation service calls `createOutboxEvent(tx, event, entityType, entityId)` inside its transaction.

**Handler:** Create a handler function in `lib/modules/<domain>/handlers/<event>-handler.ts`.

**Registration:** Register the handler in `app/api/system/outbox/process/route.ts` via `registerOutboxHandler(eventType, handler)`. Also register in `scripts/process-outbox.ts` for CLI processing.

**Handler contract:**
- Receives a typed event payload
- Performs one focused reaction (one handler = one responsibility)
- Must be idempotent (safe to call multiple times for the same event)
- Must not emit new outbox events inside another outbox handler (avoid event chains that bypass transaction safety)

**What is forbidden:**
- Registering a handler only into `IEventBus` without outbox registration
- Calling a handler directly from a route (bypasses durability)
- Emitting an event outside of a `db.$transaction()`

---

### If this is a projection

**Two-component structure is mandatory:**

1. **Builder** (`<projection>.builder.ts`) — pure function.  
   Reads current source data. Returns a discriminated union: `{ action: "upsert", data: ... } | { action: "delete" } | { action: "skip" }`.  
   No DB writes. No side effects.

2. **Orchestrator** (`<projection>.projection.ts`) — calls the builder, performs the DB upsert/delete.  
   Must be idempotent. May be called from an outbox handler or a recovery script.

**Trigger:** Projections are triggered exclusively by outbox event handlers. The route that mutates the source entity emits an outbox event. The handler calls the projection orchestrator.

**Forbidden:**
- Calling `updateXxxProjection()` directly from a mutation route
- Mixing builder logic and DB writes in the same function
- Non-idempotent projection updates

---

### If this is a cross-module entity relationship

**Canonical ownership rule:** One module owns the creation of each entity type. Other modules may read via queries but must not create or mutate entities they do not own.

**Mirror relationships** (one creation triggers a mirror in another module) must use one of:
- Single `db.$transaction()` spanning both writes (synchronous, STRONG reliability)
- Outbox event from the owning module, handler in the mirror module (async, MEDIUM reliability — acceptable for non-critical mirrors)

**The choice must be documented in the invariant matrix** (`.qoder/specs/erp-normalization-roadmap.md`, Section 5).

**Forbidden:**
- Creating an entity that requires a mirror without creating the mirror
- Creating a mirror outside a transaction with the primary entity (unless explicitly marked async+outbox)
- Two modules both claiming to own creation of the same entity type

---

## 4. Canonical Write-Path Rules

### One Operation, One Owner

Every distinct business write operation has exactly one canonical service function. There must never be two code paths that perform the same domain write.

**Canonical write path for a document cancel:**
```
route → cancelDocumentTransactional() → db.$transaction([status, movements, outbox])
```

**Forbidden:**
```
route → db.document.update(status) + createReversingMovements() + recalculateBalance()
```
(This was the bug in `cancel/route.ts`. It must not recur.)

### Transaction Boundary Location

| Scenario | Where `db.$transaction()` opens |
|----------|-------------------------------|
| Single entity creation with mirror | Inside the service that owns creation |
| Multi-step mutation (status + movements + outbox) | Inside the domain service (e.g., `confirmDocumentTransactional`) |
| Projection upsert | Inside the projection orchestrator |
| Query-only operation | Not needed |

**Transaction boundaries never open in routes.** Routes do not see transactions.

### Outbox Event Must Be in the Same Transaction

```typescript
// CORRECT
await db.$transaction(async (tx) => {
  await tx.document.update({ where: { id }, data: { status: "confirmed" } });
  await createOutboxEvent(tx, { type: "DocumentConfirmed", ... }, "Document", id);
});

// FORBIDDEN
await db.document.update({ where: { id }, data: { status: "confirmed" } });
await createOutboxEvent(db, { type: "DocumentConfirmed", ... }, "Document", id); // outside tx
```

### No Split Write Chains

A write chain where step 1 is committed and step 2 may fail is a split write chain. It creates inconsistent state on partial failure.

**Acceptable only when:**
- The second operation is idempotent and retriable (e.g., webhook retry)
- The failure mode is explicitly documented
- An idempotency guard exists that prevents double-execution

Even then, the split must be documented with a TODO and a roadmap task to unify it.

### No Partial Mirror Creation

If creating entity A requires mirror entity B:
- Both A and B must be created in the same transaction, OR
- The creation of B must be triggered by an outbox event with retry guarantees

Creating A without B, with the intention of "adding B later in the flow," is forbidden unless B's creation is outbox-backed with retry.

---

## 5. Cross-Module Invariant Rules

### Mirror Invariants

**Definition:** Creating entity A must produce entity B in another module.

**Examples:** `Counterparty → Party`, `Customer → Party`

| Rule | Detail |
|------|--------|
| Enforcement must be synchronous | Use `db.$transaction()` in the owning service |
| The mirror must be created by the owning service, not the calling route | Route calls service; service creates both |
| Mirror creation failure must roll back the primary creation | Transaction rollback is the correct behavior |
| Lazy mirror creation (on first use) is forbidden for primary entities | Party must exist at entity creation, not at first order |

**Canonical owner:** `lib/modules/accounting/services/counterparty.service.ts` for Counterparty+Party. Auth route delegates to this service for Customer+Party.

**Detection of violation:** Any call to `db.counterparty.create()` or `db.customer.create()` outside the canonical service is a violation.

---

### Bridge Invariants

**Definition:** Entity A in module X must have a corresponding linked entity in module Y that enables cross-module operations.

**Example:** `Customer → Counterparty` — a customer who places orders must have a Counterparty for accounting.

| Rule | Detail |
|------|--------|
| Bridge creation must be atomic with the operation that requires it | `getOrCreateCounterparty()` must use a transaction |
| The bridge entity must be owned by one module | Accounting owns `Counterparty`; Ecommerce calls the service |
| Duplicate bridge entities (two Counterparties for one Customer) indicate a missing transaction guard | |

---

### Projection Invariants

**Definition:** A read model (projection) must reflect the current state of its source entities.

**Example:** `Product + SalePrice + ProductDiscount → ProductCatalogProjection`

| Rule | Detail |
|------|--------|
| Every mutation of a source entity must emit an outbox event | Missing event emission is an architectural bug, not a performance choice |
| The event must be emitted in the same transaction as the mutation | See Section 4 |
| The projection may lag by at most one outbox cron cycle | Document the SLA |
| A stale projection that can only be fixed by a rebuild script is a reliability failure | |

**Detection of violation:** Any route that mutates `Product`, `SalePrice`, or `ProductDiscount` without a `createOutboxEvent()` call in the same transaction block.

---

### Lifecycle Invariants

**Definition:** A status transition in one module must trigger effects in other modules.

**Examples:** Document `confirm` → StockMovements + Journal + Balance update; Document `cancel` → reversal movements

| Rule | Detail |
|------|--------|
| All effects of a lifecycle transition must be triggered from the canonical service | No inline effects in routes |
| The critical atomic effects (stock movements) must be in the same transaction | |
| The async effects (journal, balance) must be in the outbox, written in the same transaction | |
| Cancellation must be as transactional as confirmation | The bypass in `cancel/route.ts` violates this |

---

### Tenant Isolation Invariants

**Definition:** All tenant-bound entities must be scoped to a single tenant and must never be readable across tenant boundaries.

| Rule | Detail |
|------|--------|
| `tenantId` source is always the authenticated session | Never from request body, URL params, or defaults |
| Services receive `tenantId` as an explicit parameter | Not inferred from env inside a service |
| `STORE_TENANT_ID` env var is read only in the store tenant resolution function, not in services | Documented exception; must stay isolated |
| Entities created without `tenantId` are integrity violations | Treated as bugs, not acceptable defaults |
| Schema NOT NULL + FK constraints are the final enforcement gate | Must complete Phase 4 migration |

---

## 6. Event Architecture Guardrails

### Production Event Path

```
Mutation service
  └─ db.$transaction()
       ├─ [domain writes]
       └─ createOutboxEvent(tx, event)
            └─ OutboxEvent row in DB (status: "pending")

Outbox cron (POST /api/system/outbox/process)
  └─ processOutboxEvents()
       └─ registered handlers via registerOutboxHandler()
            └─ handler function executes side effect
```

**This is the only production event path.** No exceptions.

### IEventBus Status

`IEventBus` / `InProcessEventBus` is **test infrastructure only**.

| Context | IEventBus usage |
|---------|----------------|
| Unit tests | Allowed — inject explicitly, test handlers in isolation |
| Integration tests | Allowed — inject explicitly |
| Production boot (`lib/bootstrap/`) | **FORBIDDEN** |
| `app/api/` routes | **FORBIDDEN** |
| `scripts/` | **FORBIDDEN** |

`registerAccountingHandlers(bus)` must not be called in any production code path (P2-06).

### Handler Registration

All outbox handlers must be registered in **both**:
1. `app/api/system/outbox/process/route.ts` — for HTTP-triggered cron
2. `scripts/process-outbox.ts` — for CLI-triggered processing

Adding a handler to only one location is a deployment gap.

### Event Type Inventory

Every domain event type must be listed in `.qoder/specs/event-types.md` with:
- event type string
- payload shape
- source module (who emits it)
- registered handlers (who reacts)

Adding a new event type without updating this inventory is forbidden.

### Retry and Dead-Letter Handling

| Scenario | Required behavior |
|----------|------------------|
| Handler throws on first attempt | Outbox marks event `PENDING` with incremented `attempts` and `availableAt = now + backoff` |
| Handler fails ≤ 4 times (attempts 1–4) | Event remains `PENDING` with backoff delay; retried on next eligible cron run |
| Handler fails on attempt 5 (`attempts + 1 >= MAX_RETRIES`) | Event transitions to `DEAD`; `logger.error()` emitted with `eventId`, `eventType`, `aggregateType`, `aggregateId`, `attempts`, `lastError` |
| `"dead"` events | Require manual investigation; never retried automatically; must be visible in monitoring |
| Missing retry behavior | Architectural gap — must be added as a roadmap task |

**Retry backoff schedule** (`BASE_BACKOFF_MS = 1000`, `MAX_RETRIES = 5`):

| Attempt | Backoff delay | Cumulative delay |
|---------|--------------|------------------|
| 1 | 2 s | 2 s |
| 2 | 4 s | 6 s |
| 3 | 8 s | 14 s |
| 4 | 16 s | 30 s |
| 5 (DEAD) | 32 s | ~62 s |

No event may be silently dropped. If an event cannot be processed, it must be observable.

### Outbox SLA (P2-08)

**Agreed SLA:** Under normal operating conditions, an outbox event must be delivered to its handler(s) within **120 seconds** of being written.

| Parameter | Value |
|-----------|-------|
| Cron trigger interval | 60 seconds |
| Max acceptable end-to-end delay | 120 seconds (2 cron cycles) |
| Max retry attempts before DEAD | 5 |
| Batch size per cron run | 10 (default), up to 100 |
| SLA breach threshold | `pending` event with `createdAt` > 2 minutes |
| Dead-letter threshold | Any event with `status = 'DEAD'` |

**What must be monitored:**

| Signal | Alert condition | Severity |
|--------|----------------|----------|
| `pending` count + age | Any `PENDING` event with `createdAt` > 2 minutes | WARNING |
| `dead` count | `dead > 0` | ERROR — immediate |
| `failed` count trend | Growing `failed` count without DEAD progression | WARNING |
| `processing` count | `processing > 0` for > 5 minutes (stuck PROCESSING) | WARNING |
| Cron last-run | No successful POST to `/api/system/outbox/process` in > 2 minutes | ERROR |

**Operator runbook:**

_If `dead > 0`:_
1. Query: `SELECT * FROM "OutboxEvent" WHERE status = 'DEAD' ORDER BY "createdAt" ASC;`
2. Inspect `lastError` and `eventType` to diagnose the handler failure.
3. Fix the root cause (handler bug, DB inconsistency, external dependency failure).
4. Reset the event: `UPDATE "OutboxEvent" SET status = 'PENDING', attempts = 0, "availableAt" = NOW() WHERE id = '<id>';`
5. Confirm the next cron run processes it successfully.

_If `pending` is too old (SLA breach):_
1. Check cron health: confirm `POST /api/system/outbox/process` is being called with correct `Authorization: Bearer <OUTBOX_SECRET>`.
2. Check application logs for errors during the last cron run.
3. If the cron is healthy but `pending` is still growing, increase the `limit` parameter: `{ "limit": 100 }`.
4. For emergency manual processing: `npx tsx scripts/process-outbox.ts --limit=50`.

_If `processing > 0` and not draining (stuck PROCESSING):_
1. This means a worker crashed mid-run without marking events `FAILED` or `PROCESSED`.
2. Stuck events will not be retried automatically (they are not `PENDING`).
3. Reset stuck events: `UPDATE "OutboxEvent" SET status = 'PENDING', "availableAt" = NOW() WHERE status = 'PROCESSING' AND "updatedAt" < NOW() - INTERVAL '5 minutes';`
4. _Note: stuck PROCESSING recovery is not yet automated — see P4-08._

**Health endpoint:**
```
GET /api/system/outbox/process
Authorization: Bearer <OUTBOX_SECRET>

Response: { stats: { pending, processing, processed, failed, dead, oldestPendingAt } }
```
Use this endpoint for external monitoring probes (UptimeRobot, Grafana, etc.).

---

## 7. Projection Guardrails

| Rule | Rationale |
|------|-----------|
| Projections are read models — they own no business truth | Source tables are the source of truth |
| Projections are updated via outbox event handlers exclusively | Prevents routes from directly managing projection state |
| Builder function must be pure: reads source data, returns computation | Enables unit testing without DB |
| Projection orchestrator must be idempotent: upsert/delete, never bare insert | Safe for outbox retry |
| Rebuild scripts (`rebuild-*.ts`) are disaster recovery tools | Must not be the primary update path |
| A product mutation route that does not emit an outbox event is a bug | Not a feature gap — a correctness failure |
| Projection row count must be verifiable against source row count | `verify-product-catalog-projection.ts` pattern |

**Current known gap (roadmap P2-01/02/03):** Product, SalePrice, and ProductDiscount mutation routes do not yet emit outbox events. Until this is fixed, the projection is maintained only by manual rebuild. This is an open bug, not an accepted pattern.

---

## 8. Tenant Isolation Guardrails

### tenantId Source Chain

```
HTTP session cookie
  └─ requireAuth() / requirePermission()
       └─ returns session with { tenantId, userId, role }
            └─ service receives tenantId as explicit parameter
                 └─ db.entity.create({ data: { tenantId, ... } })
```

At no point in this chain does `tenantId` come from the request body.

### Forbidden Tenant Patterns

```typescript
// FORBIDDEN: tenantId from request body
const { tenantId, name } = await parseBody(request, schema);
await db.product.create({ data: { tenantId, name } });

// FORBIDDEN: tenantId defaulted inside a service
async function createProduct(name: string) {
  const tenantId = process.env.STORE_TENANT_ID ?? "default-tenant"; // ← not in services
  await db.product.create({ data: { tenantId, name } });
}

// CORRECT
async function createProduct(tenantId: string, name: string) {
  await db.product.create({ data: { tenantId, name } });
}
```

`STORE_TENANT_ID` resolution is allowed **only** in `getStoreTenantId()` in `lib/modules/ecom/orders.ts`. This is a documented exception for the storefront context where no user session exists.

### Tenant Validation on Cross-Entity References

When a service creates an entity that references another entity (e.g., `Document → Warehouse`), it must verify that both entities belong to the same tenant before writing. The `verify-document-tenant-gate.ts` pattern is the model for this check.

### Schema Hardening Order

1. Runtime enforcement (service-level `tenantId` parameter) — must come first
2. Backfill of NULL values — must complete before schema constraint
3. Verification gate (`verify-*.ts`) — must pass before migration
4. NOT NULL + FK constraint migration — final step

Skipping steps is forbidden. Adding a schema constraint before backfill completes will break the migration.

---

## 9. Forbidden Architectural Anti-Patterns

These patterns are blocked in review. Their presence in new code is a regression regardless of whether the surrounding code is correct.

| # | Pattern | Why Forbidden |
|---|---------|--------------|
| AP-01 | `import { db } from "@/lib/shared/db"` in any file under `app/api/` | Routes must not own DB access |
| AP-02 | Inline `db.$transaction()` in a route handler | Transaction scope belongs to service layer |
| AP-03 | Duplicating a write operation that already has a canonical service | Creates divergent state paths |
| AP-04 | State machine logic (transition validation) inside a route or service | Must live in `domain/` as pure function |
| AP-05 | `createOutboxEvent()` called after `db.$transaction()` closes | Event and mutation must be atomic |
| AP-06 | `eventBus.publish()` in any production code path | IEventBus is test-only |
| AP-07 | `registerAccountingHandlers(bus)` in any production boot path | Outbox is the sole production path |
| AP-08 | Direct call to `updateProductCatalogProjection()` from a mutation route | Projections update via events only |
| AP-09 | `db.counterparty.create()` outside `createCounterpartyWithParty()` | Mirror invariant must be enforced atomically |
| AP-10 | `db.customer.create()` without subsequent `resolveParty()` in same transaction | Customer must have Party at creation |
| AP-11 | Two functions in the codebase that both implement the same domain write | One operation = one canonical implementation |
| AP-12 | A single service or module file exceeding ~300 lines with mixed responsibilities | God files hide ownership boundaries |
| AP-13 | `tenantId` accepted from HTTP request body | Tenant scope is auth-derived, not client-provided |
| AP-14 | `recalculateStock()` being called after `reconcileStockRecord()` is available | Legacy paths alongside canonical paths are forbidden |
| AP-15 | Cross-module imports that bypass a module's `index.ts` barrel | Modules are black boxes; internal paths are not public API |

---

## 10. Pre-Implementation Checklist

Before writing any implementation, answer all questions in this checklist. If any answer is "unclear," stop and clarify before writing code.

### Domain Ownership
- [ ] Which domain owns this change? (`accounting`, `ecommerce`, `party`, `finance`, `auth`, `shared`)
- [ ] Does the change touch only that domain, or does it cross module boundaries?
- [ ] If it crosses boundaries — which invariant does that create, and is it in the invariant matrix?

### Write vs. Read
- [ ] Is this a write operation or a read operation?
- [ ] If write: does a canonical service already exist for this operation?
- [ ] If yes: use the existing service. Do not add a parallel path.
- [ ] If no: create a new service file, not inline logic in the route.

### Transaction Scope
- [ ] Does this write operation affect more than one table?
- [ ] If yes: is `db.$transaction()` used at the service level?
- [ ] Are there side effects that must be durable (balance update, projection update, journal entry)?
- [ ] If yes: is `createOutboxEvent()` called inside the transaction?

### Cross-Module Invariants
- [ ] Does this change create a new entity that requires a mirror in another module?
- [ ] Does this change affect an entity that has a dependent projection?
- [ ] If projection affected: does the mutation emit the correct outbox event?
- [ ] Is the invariant already in the matrix? If not, add it.

### Tenant Safety
- [ ] Does the new entity require `tenantId`?
- [ ] Is `tenantId` sourced from the authenticated session (not request body)?
- [ ] Is `tenantId` passed explicitly to the service?

### Module Placement
- [ ] Does the new file belong in `domain/`, `services/`, `handlers/`, `projections/`, or `queries/`?
- [ ] Is the file location consistent with the canonical module structure (Section 6 of the roadmap)?
- [ ] Does the new file name follow the naming convention?

### Regression Risk
- [ ] Does this change risk creating a duplicate write path?
- [ ] Does this change modify an existing service in a way that could break callers?
- [ ] Does this change remove an outbox event type that has registered handlers?

### Test Coverage
- [ ] Does the change affect a critical invariant that requires an integration test?
- [ ] Is there a test that verifies failure behavior (partial failure, retry, rollback)?

---

## 11. Definition of Success for New Work

Work is considered architecturally correct when all of the following are true:

### For a new route
- The route file contains no `db` import
- The route is ≤ 40 lines of logic
- The route calls exactly one service (or two for read+write separation)
- The route performs no calculations beyond response mapping

### For a new service
- The service owns all writes for its operation
- All multi-table writes are inside `db.$transaction()`
- Outbox events are inside the transaction
- The service is idempotent or has a documented idempotency guard
- No other function in the codebase duplicates its responsibility

### For a new event handler
- The handler is registered in both the HTTP cron route and the CLI script
- The handler is idempotent
- The handler is listed in the event types inventory
- The handler has a unit test that runs it in isolation

### For a new projection
- The builder is pure and unit-tested without a DB
- The orchestrator is idempotent
- The orchestrator is triggered exclusively via an outbox event handler
- A verify script or test exists that checks projection consistency

### For any cross-module invariant
- The invariant is in the matrix in the normalization roadmap
- The enforcement mechanism is documented (sync transaction vs. async outbox)
- There is a test that verifies the invariant holds under failure conditions
- No second code path exists that could produce the entity without satisfying the invariant

---

## 12. Review Protocol

### Before Implementation: Architecture Alignment Check

Run through the following before writing any code:

1. **Identify domain owner** — which module owns this operation?
2. **Identify invariant impact** — does this create, modify, or depend on a cross-module invariant?
3. **Check roadmap phase** — does this belong to an existing task in `.qoder/specs/erp-normalization-roadmap.md`? If yes, implementation must follow the task definition.
4. **Check for existing canonical service** — is there already a service function for this operation? If yes, use it.
5. **Identify transaction needs** — does the write need a transaction? Does it need an outbox event?
6. **Identify projection impact** — does this mutation affect a projection? Is the event emission in place?
7. **Confirm module placement** — does the planned file location match the canonical structure?

### After Implementation: Architecture Verification

Verify all of the following before marking work complete:

| Check | How to verify |
|-------|--------------|
| No route contains `db` access | `grep -r "from.*@/lib/shared/db" app/api/` should return 0 results in changed files |
| No duplicated write path created | Search for the same operation across the codebase |
| Outbox event emitted inside transaction | Code review of transaction block |
| Invariant enforcement present | Trace the creation flow end-to-end |
| Tests cover the invariant | Confirm integration test exists for the cross-module path |
| Tenant safety maintained | `tenantId` traced from session to `db.entity.create()` |
| Module file structure matches canonical layout | Compare against Section 6 of the roadmap |
| No dead handler registrations introduced | Confirm every `registerOutboxHandler()` call has a matching event emission path |

---

## 13. Short Operational Summary

### Where Code Goes

| Code type | Location |
|-----------|---------|
| Permission check + input parsing + response mapping | `app/api/<domain>/<resource>/route.ts` |
| Write orchestration, transactions, outbox emission | `lib/modules/<domain>/services/<operation>.service.ts` |
| Pure business rules, state machines | `lib/modules/<domain>/domain/<entity>-<rule>.ts` |
| Read-only DB queries | `lib/modules/<domain>/queries/<entity>.queries.ts` |
| Outbox event reactions | `lib/modules/<domain>/handlers/<event>-handler.ts` |
| Projection computation (pure) | `lib/modules/<domain>/projections/<projection>.builder.ts` |
| Projection DB upsert (orchestrator) | `lib/modules/<domain>/projections/<projection>.projection.ts` |
| Input validation schemas | `lib/modules/<domain>/schemas/<entity>.schema.ts` |

### What Is Forbidden (Absolute)

1. `db` import in route files
2. Business logic inside route handlers
3. Two implementations of the same write operation
4. Outbox event emitted outside a transaction
5. `IEventBus` used in production boot or route code
6. Projection updated directly from a route
7. Entity with required mirror created without atomically creating the mirror
8. `tenantId` sourced from request body
9. Cross-module imports bypassing `index.ts` barrel
10. God files mixing multiple domain responsibilities

### How to Know Work Is Successful

- The route is thin: auth → service call → response
- The write has one owner: the service
- The invariant is enforced: verified by a test under failure conditions
- The projection is connected: the mutation route emits the outbox event
- The tenant is safe: `tenantId` traces from session to DB row
- No new dead paths: every registered handler has an emission path
- The module is navigable: a new developer can find the owner of any operation within 30 seconds

---

*This document is the operational companion to `.qoder/specs/erp-normalization-roadmap.md`.  
All structural changes to the ListOpt ERP codebase must comply with both documents.*

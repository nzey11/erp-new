# ERP NORMALIZATION ROADMAP

> **Version:** 1.0  
> **Status:** ACTIVE — CONTRACT DOCUMENT  
> **Basis:** Architecture Audit (March 2026) + Cross-Module Invariant Analysis  
> **Owner:** ERP System Architect

---

## 1. Purpose of This Document

This document is the **official normalization plan** for the ListOpt ERP codebase.

It converts the findings of the full architectural audit and cross-module invariant analysis into a structured, multi-phase execution program.

### Authority

- This document **governs all structural refactors**. Any refactoring task that touches module layout, service boundaries, event wiring, or tenant enforcement must reference a task in this roadmap.
- **Tasks must follow the defined phase order.** Phases may not be reordered unless this document is explicitly updated with a documented reason.
- **Success criteria define completion.** A phase is not complete until all success criteria pass — not when implementation looks done.

### What This Document Is Not

- It is not a file-by-file refactor checklist.
- It is not a feature roadmap.
- It does not prescribe implementation details inside task scope.

---

## 2. Architectural Principles (Non-Negotiable Rules)

The following rules are permanent and must be enforced in all new and modified code from this point forward. Violations are architectural regressions regardless of whether a refactor task is in progress.

### Route Layer
- **Routes must not contain business logic.**
- **Routes must not import Prisma (`db`) directly.** All database access goes through services or query functions.
- Routes are responsible only for: request parsing, permission check, service delegation, response serialization, error mapping.

### Service Layer
- **Services own all write operations.**
- A write operation that affects more than one table must use `db.$transaction()`.
- Services must not be duplicated. One operation = one service function. If a route needs that operation, it calls the service.

### Domain Layer
- **Domain rules must be pure functions.** Zero DB access, zero side effects. Inputs → typed result or typed error.
- State machines and validation logic live in the domain layer, not in services or routes.

### Event Architecture
- **Cross-module side effects must be triggered via outbox events**, not direct synchronous calls between services.
- The outbox is the **sole production event delivery mechanism**. `IEventBus` is a test utility only.
- An outbox event must be written inside the **same `db.$transaction()`** as the mutation that triggers it.

### Projections
- **Projections must be updated via outbox event handlers**, not via direct calls from mutation routes.
- A projection rebuild script is a recovery tool, not the primary update mechanism.

### Tenant Isolation
- **`tenantId` must be present on all tenant-bound entities at creation time.**
- Tenant scoping is the responsibility of the service layer. Routes derive `tenantId` from the authenticated session and pass it to the service.
- Tenant isolation must be enforced at the DB level (NOT NULL + FK constraint) for all entities where the constraint migration has been gated.

### Identity / CRM Integration
- **Creating a `Counterparty` or `Customer` must atomically produce a `Party` mirror in CRM.**
- `resolveParty()` must be called inside the same transaction as the primary entity creation.

---

## 3. Phase Overview

| Phase | Name | Goal | Key Risk Removed |
|-------|------|------|-----------------|
| **P0** | Architecture Standardization | Define and publish canonical standards | Developer confusion, inconsistent new code |
| **P1** | Critical Integrity Fixes | Fix active data integrity bugs | Silent data corruption, stock/status divergence |
| **P2** | Event & Invariant Architecture | Make all cross-module invariants STRONG | Stale projections, missing CRM mirrors, dual event paths |
| **P3** | Module Normalization | Eliminate god files, dual directories, misplaced logic | Navigation complexity, code ownership ambiguity |
| **P4** | Hardening & Enforcement | DB-level constraints, linting rules, regression gates | Future violations of rules established in P0–P3 |

### Phase Dependency Chain

```
P0 → P1 → P2 → P3 → P4
          ↑
     P1 must precede P2
     (invariants cannot be hardened until bypasses are removed)
```

---

## 4. Detailed Phase Plans

---

### Phase 0 — Architecture Standardization

#### Objective
Establish the canonical module structure, document the architectural principles, and ensure every developer has a single authoritative reference before any structural changes begin.

#### Scope
- `.qoder/specs/` — this roadmap
- `ARCHITECTURE.md` — update to reflect current canonical standard
- No production code changes in this phase

#### Tasks

**P0-01**  
Publish this roadmap as the authoritative contract document.  
Location: `.qoder/specs/erp-normalization-roadmap.md`

**P0-02**  
Update `ARCHITECTURE.md` to reflect:
- The canonical module structure (see Section 6)
- The outbox-only event delivery rule
- The route/service/domain layer boundaries
- The tenant isolation rule

**P0-03**  
Document the official event types inventory.  
Create `.qoder/specs/event-types.md` listing all domain events, their source module, and their registered outbox handlers.  
This makes the INV-11 problem (dual registry confusion) visible and auditable.

#### Success Criteria
- `ARCHITECTURE.md` reflects the principles in Section 2 of this document
- Event types document exists and is accurate
- No new code merged that violates the principles in Section 2

#### Risks
- None — this phase makes no production changes.

#### Dependencies
- None. P0 is the entry point.

---

### Phase 1 — Critical Integrity Fixes

#### Objective
Fix the three active data integrity risks that can cause silent data corruption or divergent state without any error being surfaced.

#### Scope
- `app/api/accounting/documents/[id]/cancel/route.ts`
- `lib/modules/ecom/orders.ts` — `getOrCreateCounterparty()`, `confirmOrderPayment()`, `confirmEcommerceOrderPayment()`
- `app/api/accounting/counterparties/route.ts`
- `lib/modules/accounting/services/document-confirm.service.ts`

#### Tasks

**P1-01**  
Wire `cancel/route.ts` to `cancelDocumentTransactional()`.  
Remove the inline cancel sequence (lines 21–76) from the route.  
The route must call `cancelDocumentTransactional(id, actor)` and return the result.  
_Affects: `app/api/accounting/documents/[id]/cancel/route.ts`_

**P1-02**  
Create `createCounterpartyWithParty()` application service.  
This service wraps `db.counterparty.create()` + `resolveParty()` in a single `db.$transaction()`.  
It becomes the sole entry point for Counterparty creation across the codebase.  
_New file: `lib/modules/accounting/services/counterparty.service.ts`_

**P1-03**  
Replace direct `db.counterparty.create()` in `app/api/accounting/counterparties/route.ts` with a call to `createCounterpartyWithParty()`.  
Remove the non-atomic two-step (create then resolveParty).

**P1-04**  
Replace direct `db.counterparty.create()` in `getOrCreateCounterparty()` (`lib/modules/ecom/orders.ts`) with a call to `createCounterpartyWithParty()`.  
Ensure the `db.customer.update({ counterpartyId })` call is inside the same transaction.

**P1-05**  
Merge the two payment-confirmation functions in `lib/modules/ecom/orders.ts`.  
`confirmOrderPayment()` and `confirmEcommerceOrderPayment()` perform the same operation with slightly different signatures.  
Consolidate into one canonical function.  
Ensure the `paymentStatus` update and `confirmDocumentTransactional()` call share a transaction boundary (or document explicitly why they cannot and add idempotency guard).

#### Success Criteria
- `cancel/route.ts` contains zero direct `db` calls and zero inline state machine logic
- `db.counterparty.create()` appears only inside `createCounterpartyWithParty()`
- `getOrCreateCounterparty()` calls `createCounterpartyWithParty()`
- Exactly one function handles payment confirmation for ecom orders
- `confirmOrderPayment()` and `confirmEcommerceOrderPayment()` do not both exist

#### Risks
- **P1-01:** Cancel route tests must be updated to reflect the new delegation. Verify that `cancelDocumentTransactional()` handles all edge cases the inline route handled (including the `recalculateBalance` call — confirm it is inside the service).
- **P1-02/03/04:** `resolveParty()` failure inside a transaction will roll back the Counterparty creation. This is the correct behavior but must be tested explicitly.
- **P1-05:** Webhook retry semantics depend on idempotency. Confirm the merged function is idempotent before removing the old one.

#### Dependencies
- P0 must be complete (canonical standard must exist before implementation begins)

---

### Phase 2 — Event & Invariant Architecture

#### Objective
Make all cross-module invariants STRONG or MEDIUM-STRONG. Eliminate the MISSING-reliability invariants. Retire the dead `IEventBus` production registration.

#### Scope
- `app/api/accounting/products/[id]/route.ts` and related product mutation routes
- `app/api/accounting/products/[id]/discounts/route.ts`
- `app/api/accounting/prices/sale/route.ts`
- `app/api/auth/customer/telegram/route.ts`
- `app/api/ecommerce/orders/quick-order/route.ts`
- `lib/modules/accounting/register-handlers.ts`
- `lib/events/event-bus.ts`
- `lib/events/outbox.ts`
- `app/api/system/outbox/process/route.ts`

#### Tasks

**P2-01**  
Emit `product.updated` outbox event on every product metadata mutation.  
In `app/api/accounting/products/[id]/route.ts` (PUT handler): after `db.product.update()`, emit `createOutboxEvent(tx, { type: "product.updated", payload: { productId: id } }, "Product", id)` inside the same transaction.  
Requires the product `update` to be moved into a transaction block if not already.

**P2-02**  
Emit `sale_price.updated` outbox event on every sale price mutation.  
In `app/api/accounting/prices/sale/route.ts` (and the inline price update in `products/[id]/route.ts`): emit `createOutboxEvent(tx, { type: "sale_price.updated", payload: { productId } }, "SalePrice", productId)`.

**P2-03**  
Emit `discount.updated` outbox event on every discount mutation.  
In `app/api/accounting/products/[id]/discounts/route.ts`: emit `createOutboxEvent(tx, { type: "discount.updated", payload: { productId } }, "ProductDiscount", productId)`.

**P2-04**  
Call `resolveParty({ customerId })` inside `db.$transaction()` immediately after `db.customer.create()` in `app/api/auth/customer/telegram/route.ts`.  
This ensures every new Customer has a Party mirror at creation, not lazily on first order.

**P2-05**  
Call `resolveParty({ customerId })` after guest customer creation in `app/api/ecommerce/orders/quick-order/route.ts`.  
The synthetic `telegramId` guest customer must also have a Party.

**P2-06**  
Remove `registerAccountingHandlers(bus)` call from the production bootstrap path.  
The `IEventBus` handler registration must not be wired at runtime — it is a test utility only.  
Verify that the outbox handlers (`registerOutboxHandler(...)`) in `app/api/system/outbox/process/route.ts` cover all the same events.  
_Affects: `lib/bootstrap/domain-events.ts` (or wherever `registerAccountingHandlers` is called at startup)_

**P2-07**  
Add dead-letter queue semantics to `processOutboxEvents()`.  
After N consecutive failures for a single event, transition its status to `"dead"` (not `"failed"`).  
Add a monitoring endpoint or log alert for events in `"dead"` status.  
_Affects: `lib/events/outbox.ts`_

**P2-08**  
Document the outbox SLA.  
The cron interval for `POST /api/system/outbox/process` must be defined and documented.  
Acceptable maximum delay between event write and handler execution must be stated in `ARCHITECTURE.md`.

#### Success Criteria
- Every product/price/discount mutation route emits the corresponding outbox event
- `ProductCatalogProjection` is updated within one cron cycle after any product mutation (verifiable via `verify-product-catalog-projection.ts`)
- Every new `Customer` has a `Party` at the time of creation, not lazily
- `IEventBus` is not registered with production handlers at runtime
- `registerAccountingHandlers` is not called in any production boot path
- Outbox events that fail >N times are marked `"dead"` and logged

#### Risks
- **P2-01/02/03:** Product mutation routes currently do not use `db.$transaction()`. Adding transaction scope may affect performance on complex mutations. Benchmark before deploying.
- **P2-04/05:** `resolveParty()` inside the Telegram auth transaction means auth failure on Party creation would block login. Implement with a try/catch that logs the failure but does not block the auth flow if Party creation fails (degrade gracefully — Party can be backfilled).
- **P2-06:** If `registerAccountingHandlers` was also used in tests, those tests must be updated to wire handlers explicitly rather than via the bootstrap function.

#### Dependencies
- P1 must be complete (bypass paths removed before we harden the canonical paths)

---

### Phase 3 — Module Normalization

#### Objective
Eliminate navigation complexity: god files, dual directories, misplaced logic. Bring all modules to the canonical structure defined in Section 6.

#### Scope
- `lib/modules/ecom/` vs `lib/modules/ecommerce/` directories
- `lib/modules/ecom/orders.ts` (642 lines)
- `tests/helpers/factories.ts` (923 lines)
- `lib/modules/finance/reports.ts` — misplaced write operation (`recalculateBalance`)
- `lib/modules/accounting/inventory/stock.ts` — legacy `recalculateStock()` path

#### Tasks

**P3-01**  
Merge `lib/modules/ecom/` into `lib/modules/ecommerce/`.  
`lib/modules/ecom/` was created as a temporary relocation. All exports must be re-homed under `lib/modules/ecommerce/` with appropriate subdirectory structure.  
Update all import paths.  
_Affects: all files importing from `@/lib/modules/ecom/`_

**P3-02**  
Split `lib/modules/ecom/orders.ts` (post-merge: `ecommerce/orders/`) into focused service files:
- `ecommerce/services/order-create.service.ts` — `createSalesOrderFromCart()`
- `ecommerce/services/order-payment.service.ts` — payment confirmation functions
- `ecommerce/services/order-cancel.service.ts` — cancellation
- `ecommerce/queries/orders.queries.ts` — `getCustomerOrders()`, `getCustomerOrder()`, admin queries
- `ecommerce/services/counterparty-bridge.service.ts` — `getOrCreateCounterparty()` (to be replaced by P1-04 result)

**P3-03**  
Move `recalculateBalance()` out of `lib/modules/finance/reports.ts`.  
It is a write operation misplaced in a read module.  
Target: `lib/modules/accounting/services/balance.service.ts`.  
Update all callers.

**P3-04**  
Deprecate and remove legacy stock calculation functions.  
`recalculateStock()` and `updateStockForDocument()` in `lib/modules/accounting/inventory/stock.ts` duplicate what `reconcileStockRecord()` does via the movement-sum approach.  
Steps:
1. Confirm no active caller uses `recalculateStock()` after P1 is complete.
2. Add `@deprecated` JSDoc annotations.
3. Remove in a follow-up PR once confirmed safe.

**P3-05**  
Split `tests/helpers/factories.ts` (923 lines) into domain-scoped factory files:
- `tests/helpers/factories/accounting.ts`
- `tests/helpers/factories/ecommerce.ts`
- `tests/helpers/factories/party.ts`
- `tests/helpers/factories/auth.ts`
- `tests/helpers/factories/index.ts` — re-exports all

**P3-06**  
Fix `createCounterparty()` in `tests/helpers/factories.ts` (line 144): add `tenantId` parameter so test counterparties are always tenant-scoped. Update all call sites in tests.

**P3-07**  
Move `publishDocumentConfirmed()` dead code from `document-confirm.service.ts` to a deletion.  
Verify it has no active callers (grep + TS compilation), then remove.

#### Success Criteria
- `lib/modules/ecom/` directory does not exist
- No single service file exceeds 300 lines
- `recalculateBalance()` is not in `finance/reports.ts`
- `recalculateStock()` and `updateStockForDocument()` are removed from `inventory/stock.ts`
- `tests/helpers/factories.ts` does not exist as a monolith; domain factories are in separate files
- `publishDocumentConfirmed()` is removed
- `createCounterparty()` in test factories always requires `tenantId`

#### Risks
- **P3-01:** Import path changes affect a large number of files. Run TypeScript compiler (`tsc --noEmit`) after the merge to catch broken imports before testing.
- **P3-02:** Splitting the god file must not change behavior. Each extracted function must be tested in isolation before the monolith is deleted.
- **P3-04:** `recalculateStock()` removal must be preceded by a grep scan for any usage in scripts or scheduled jobs, not just source files.

#### Dependencies
- P1 must be complete (P3-04 depends on legacy callers being removed by P1)
- P2 must be complete (P3-01 merge is safer once event wiring is verified)

---

### Phase 4 — Hardening & Enforcement

#### Objective
Lock in the gains from P1–P3 by adding DB-level constraints, TypeScript linting rules, and automated verification gates that prevent future regressions.

#### Scope
- Prisma schema — `tenantId` constraint migrations
- ESLint configuration
- CI pipeline
- `scripts/verify-*` gates

#### Tasks

**P4-01**  
Complete `Product.tenantId` Phase 4 schema migration.  
Precondition: `npx tsx scripts/verify-product-tenant-gate.ts` passes.  
Action: add `NOT NULL` constraint and FK to `Tenant` on `Product.tenantId` in Prisma schema.  
Run migration.

**P4-02**  
Complete `Document.tenantId` Phase 4 schema migration.  
Precondition: `npx tsx scripts/verify-document-tenant-gate.ts` passes.  
Action: add `NOT NULL` constraint and FK to `Tenant` on `Document.tenantId`.

**P4-03**  
Add `ProductVariant.tenantId` NOT NULL constraint.  
Precondition: `backfill-product-variant-tenant.ts` has been run and verified.

**P4-04**  
Add ESLint rule to forbid direct `db` / Prisma client imports in route files.  
Target pattern: `import.*from.*@/lib/shared/db` in `app/api/**/*.ts`.  
This enforces the "routes must not import Prisma" rule from Section 2.

**P4-05**  
Add ESLint rule or TypeScript path alias restriction to forbid cross-module direct imports.  
Modules may only import from another module's `index.ts` barrel, never from internal paths.  
Example violation: `import { recalculateBalance } from "@/lib/modules/finance/reports"` from outside `finance/`.

**P4-06**  
Add a CI step that runs all `scripts/verify-*.ts` gates on every PR.  
Gate failures must block merge.

**P4-07**  
Add a CI step that runs `tsc --noEmit` and reports dead exports.  
This catches future dead code accumulation (like `publishDocumentConfirmed()`).

**P4-08**  
Add an outbox health check to CI or monitoring.  
Alert if any `OutboxEvent` has status `"dead"` or `"failed"` and age > 1 hour.

#### Success Criteria
- `Product.tenantId`, `Document.tenantId`, `ProductVariant.tenantId` have NOT NULL + FK constraints in the schema
- ESLint blocks Prisma imports in route files
- CI runs verify gates on every PR
- `tsc --noEmit` runs clean in CI
- Outbox health check is operational

#### Risks
- **P4-01/02/03:** Schema migrations with NOT NULL constraints on large tables require careful downtime or online migration strategy. Verify row counts and plan accordingly.
- **P4-04/05:** ESLint rules may produce a large number of existing violations on first run. Introduce as warnings first, then upgrade to errors after fixing existing violations.

#### Dependencies
- P1, P2, P3 must be complete
- All backfill scripts must have been run successfully before schema constraints are added

---

## 5. Cross-Module Invariants

| # | Invariant | Description | Current Reliability | Target Enforcement | Responsible Module |
|---|-----------|-------------|--------------------|--------------------|-------------------|
| INV-01 | Counterparty → Party | Every Counterparty has a Party + PartyLink in CRM | WEAK | Application service (`createCounterpartyWithParty`) + transaction | `accounting/services/counterparty.service.ts` |
| INV-02 | Customer → Party | Every Customer has a Party at creation time | MISSING | `resolveParty()` inside auth transaction | `lib/party` (called from auth route) |
| INV-03 | Customer → Counterparty | First ecom order creates a linked Counterparty atomically | MEDIUM | Single transaction in `getOrCreateCounterparty` | `ecommerce/services/counterparty-bridge.service.ts` |
| INV-04 | Product/Price/Discount → Projection | Storefront catalog reflects all product mutations | MISSING | Outbox event emitted in mutation transaction | `accounting` routes → `ecommerce/handlers/catalog-handler.ts` |
| INV-05 | Document confirm → Stock movements | Confirmation atomically creates StockMovements | STRONG (confirm) / WEAK (cancel bypass) | Cancel route wired to `cancelDocumentTransactional()` | `accounting/services/document-confirm.service.ts` |
| INV-06 | Document confirm → CounterpartyBalance | Confirmation updates balance within outbox SLA | MEDIUM | Outbox handler + SLA documentation + alerting | `accounting/handlers/balance-handler.ts` |
| INV-07 | Document confirm → Finance Journal | Confirmation creates journal entries within outbox SLA | MEDIUM | Outbox handler + dead-letter queue | `accounting/handlers/journal-handler.ts` |
| INV-08 | Payment mark → Document confirm | `paymentStatus=paid` and `status=confirmed` are atomic | MEDIUM | Merged into single transaction in order service | `ecommerce/services/order-payment.service.ts` |
| INV-09 | Product → tenantId | All products have tenant scope at creation | MEDIUM | NOT NULL + FK constraint (Phase 4) | `accounting` + `product` creation services |
| INV-10 | Document → tenantId + warehouse match | Documents have tenant scope matching their warehouse | MEDIUM | NOT NULL + FK constraint (Phase 4) | `accounting/services/document-confirm.service.ts` |
| INV-11 | Outbox is sole event path | No production handler wired to IEventBus | WEAK | Remove `registerAccountingHandlers` from production boot | `lib/events/` + `lib/bootstrap/` |
| INV-12 | Party merge → PartyLink consistency | Merged Party's links point to survivor | MEDIUM | Update PartyLinks in merge service transaction | `lib/party/services/` |

---

## 6. Canonical Module Structure

All new modules and all modules touched during P1–P3 must conform to this layout.

```
lib/modules/<domain>/
  index.ts              — Public barrel export. Only this file is imported by other modules.
  types.ts              — Domain types, value objects, result types (no Prisma imports)

  domain/               — Pure functions only. Zero DB. Zero side effects.
    <entity>-states.ts  — State machines, transition validators
    <entity>-rules.ts   — Business rules, invariant checks

  services/             — Application services. Own all write operations.
    <operation>.service.ts

  handlers/             — Outbox event handlers. One handler = one reaction.
    <event>-handler.ts

  projections/          — Read model builders and update orchestrators.
    <projection>.builder.ts   — Pure: read source data, compute projection row
    <projection>.projection.ts — Orchestrator: builder + DB upsert/delete

  queries/              — Read-only DB queries. No writes.
    <entity>.queries.ts

  schemas/              — Zod validation schemas for API input.
    <entity>.schema.ts

  dto/                  — Data transfer objects, API response shapes.
    <entity>.dto.ts
```

### Directory Responsibilities

| Directory | Allowed | Forbidden |
|-----------|---------|-----------|
| `domain/` | Pure functions, type guards, value objects | DB imports, side effects, `async` |
| `services/` | `db.$transaction()`, orchestration, calling domain functions | Direct HTTP, event publishing (use outbox) |
| `handlers/` | Calling services or queries in reaction to events | Direct DB mutations, calling other handlers |
| `projections/` | Read queries + upsert/delete of projection table | Business logic, state transitions |
| `queries/` | `db.*.findMany()`, `db.*.findUnique()`, aggregations | Any write operation |
| `schemas/` | Zod schema definitions | Runtime logic |
| `dto/` | TypeScript interfaces and type aliases | Runtime logic |

### Cross-Module Import Rule

A module may only be imported via its `index.ts` barrel.

```
✅  import { createCounterpartyWithParty } from "@/lib/modules/accounting"
✅  import { resolveParty } from "@/lib/party"
❌  import { recalculateBalance } from "@/lib/modules/finance/reports"
❌  import { createMovementsForDocument } from "@/lib/modules/accounting/inventory/stock-movements"
```

---

## 7. Architectural Anti-Patterns (Forbidden Patterns)

The following patterns are explicitly forbidden. Their presence in new code is a blocking review issue.

### AP-01: Prisma in Routes
```typescript
// FORBIDDEN
import { db } from "@/lib/shared/db";
export async function POST(request) {
  await db.document.update(...);
}
```
Routes must call a service. The service owns `db`.

### AP-02: Duplicate Write Paths
Two functions that perform the same domain write operation must not coexist. One operation = one service function. Callers must use the service.

Example of violation: `cancelDocumentTransactional()` exists in the service AND cancel logic duplicated in `cancel/route.ts`.

### AP-03: Business Logic in API Handlers
State machine transitions, validation rules, or calculation logic must not appear inline in route handlers. They belong in `domain/` (pure) or `services/` (with DB).

### AP-04: Multiple Projection Update Paths
A projection must be updated by exactly one mechanism: its outbox handler. Direct calls to `updateProductCatalogProjection()` from routes or services (outside the handler) are forbidden.

### AP-05: Multiple Event Delivery Mechanisms
`IEventBus.publish()` must not be called in production code paths. Outbox is the only delivery mechanism. `IEventBus` is used in unit tests only, injected explicitly.

### AP-06: God Files
A single file must not own more than one bounded domain concept. Files exceeding ~300 lines are a signal that split is needed. No file may mix queries, writes, and domain rules.

### AP-07: Non-Atomic Cross-Entity Creation
Creating two related entities (e.g., `Counterparty` + `Party`) in separate DB operations without a transaction is forbidden. If creation of B is a mandatory consequence of creating A, both happen in the same `db.$transaction()`.

### AP-08: Tenant-Unscoped Entity Creation
Any service that creates a tenant-bound entity must receive `tenantId` as an explicit argument and write it to the entity at creation. Defaulting to `undefined` or inferring it from environment variables inside service functions is forbidden (only the route layer may read `STORE_TENANT_ID` from env).

### AP-09: Legacy Calculation Paths Alongside Canonical Ones
When a canonical calculation path exists (`reconcileStockRecord` via movement-sum), the legacy path (`recalculateStock` via document-item aggregate) must be removed, not kept alongside. Coexistence creates an ambiguous source of truth.

---

## 8. Validation Checklist

Use this checklist before merging any PR that touches services, routes, or domain logic.

### Data Integrity
- [ ] Every `db.counterparty.create()` call is inside `createCounterpartyWithParty()` and wrapped in a transaction
- [ ] Every `db.customer.create()` call is followed by `resolveParty()` in the same transaction (or explicitly documented why it cannot be)
- [ ] `paymentStatus` update and `confirmDocumentTransactional()` share a transaction boundary (or have explicit idempotency guard)
- [ ] `cancel/route.ts` delegates entirely to `cancelDocumentTransactional()` with no inline logic

### Event Architecture
- [ ] Every product/price/discount mutation emits the corresponding outbox event inside the mutation transaction
- [ ] No `eventBus.publish()` call exists in production code (only in test files)
- [ ] No `registerAccountingHandlers(bus)` call exists in any production boot path
- [ ] Outbox handler registration in `app/api/system/outbox/process/route.ts` covers all active event types

### Module Structure
- [ ] No file in `lib/modules/` imports `db` directly in a route handler
- [ ] No file cross-imports from another module's non-`index.ts` path
- [ ] No module contains both pure domain logic and DB writes in the same file
- [ ] `lib/modules/ecom/` directory does not exist

### Tenant Isolation
- [ ] Every `db.product.create()` includes `tenantId`
- [ ] Every `db.document.create()` includes `tenantId`
- [ ] Every `db.productVariant.create()` includes `tenantId`
- [ ] New entity creation services receive `tenantId` as an explicit parameter

### Tests
- [ ] `createCounterparty()` in test factories always receives `tenantId`
- [ ] Test factories are domain-scoped (no monolithic `factories.ts`)
- [ ] Cancel flow has an integration test that verifies stock is reversed atomically

---

## 9. Completion Definition

The normalization roadmap is considered **complete** when all of the following are true:

1. **All five phases implemented** — every task in P0–P4 has been executed and its success criteria have been verified.

2. **Invariants enforced** — every invariant in Section 5 has reliability rated STRONG or MEDIUM-STRONG (i.e., enforced by service boundary + transaction, not by developer convention).

3. **No legacy bypass paths remain:**
   - `cancel/route.ts` contains no inline business logic
   - `recalculateStock()` and `updateStockForDocument()` are removed
   - `publishDocumentConfirmed()` is removed
   - `IEventBus` is not wired to production handlers
   - `lib/modules/ecom/` does not exist

4. **Module structure matches the standard** — every module under `lib/modules/` and `lib/party/` conforms to the canonical layout in Section 6.

5. **Enforcement is automated** — ESLint rules block Prisma imports in routes, CI runs verify gates, schema constraints exist for `tenantId` on all tenant-bound entities.

6. **The roadmap document itself is up to date** — if any task was modified, superseded, or added during implementation, this document reflects those changes.

---

*This document was generated from the full architectural audit (March 2026) and the cross-module invariant analysis. It is the single authoritative source for structural normalization work in the ListOpt ERP codebase.*

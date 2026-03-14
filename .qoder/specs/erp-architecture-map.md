# ERP Architecture Map

> **Version:** 1.0  
> **Status:** ACTIVE — STRUCTURAL REFERENCE  
> **Owner:** ERP System Architect  
> **Companion documents:**  
> — `.qoder/specs/erp-normalization-roadmap.md` — execution plan for normalization  
> — `.qoder/specs/erp-architecture-guardrails.md` — permanent architectural rules

---

## 1. Purpose

This document is the **high-level architecture map** of the ListOpt ERP system.

It answers the structural question: *how is the system built, what owns what, and how does data move through it?*

### Three Documents, Three Roles

| Document | Role |
|----------|------|
| **This map** | Describes what the system *is* — domains, ownership, data flows, invariants |
| **Normalization Roadmap** | Describes what must *change* — execution phases, tasks, success criteria |
| **Architecture Guardrails** | Describes what must *stay true forever* — rules, forbidden patterns, checklists |

This document is intended for three audiences:
- **Developers** — to know where code belongs and who owns which entity
- **AI coding agents** — to reason about impact before making changes
- **Project owner** — to understand how the business system is structured without reading code

---

## 2. Domain Overview

The ERP is a **modular monolith**: all code runs in a single Next.js application, but is organized into bounded domains with explicit ownership boundaries.

---

### Accounting

**Responsible for:**
- The lifecycle of all business documents (sales orders, purchase orders, stock receipts, write-offs, stock transfers, inventory counts)
- Document state machine (draft → confirmed → cancelled)
- Counterparty management (customers, suppliers)
- Variant-to-product matching for document items

**Does NOT own:**
- Stock movement logic (owned by Inventory)
- Balance calculation (shared service, target: own accounting service)
- Payment records (owned by Finance)
- CRM identity (owned by Party)

**Main inputs:** Admin UI actions, ecommerce order confirmations, webhooks  
**Main outputs:** Confirmed/cancelled documents, `DocumentConfirmed` outbox events

---

### Inventory

**Responsible for:**
- `StockMovement` — the immutable, append-only log of all physical stock changes
- `StockRecord` — the materialized projection of current stock per product per warehouse
- Stock availability checks before confirmation
- Reversing movements on cancellation
- Average cost tracking on receipts and transfers

**Does NOT own:**
- Document lifecycle (owned by Accounting)
- Product metadata (owned by the Product catalog)

**Main inputs:** Document confirmation and cancellation events  
**Main outputs:** StockMovement records, updated StockRecord projections

---

### Finance

**Responsible for:**
- Double-entry bookkeeping: `JournalEntry`, `LedgerLine`, posting rules
- `CounterpartyBalance` — the materialized balance per counterparty
- Payment records (`Payment` model)
- Financial reports (balance sheet, P&L — read-only aggregations)

**Does NOT own:**
- Document lifecycle
- Stock
- CRM data

**Main inputs:** `DocumentConfirmed` outbox event  
**Main outputs:** Journal entries, counterparty balance updates, payment records

---

### Ecommerce

**Responsible for:**
- Storefront: product catalog display, cart, checkout
- Customer-facing order lifecycle (`sales_order` document type)
- Payment webhook processing (T-Bank/Tochka integration)
- `ProductCatalogProjection` — the storefront read model

**Does NOT own:**
- Product source data (owned by the product catalog under Accounting)
- Document state machine (owned by Accounting)
- CRM identity (owned by Party)

**Main inputs:** Customer actions (cart, checkout, payment), payment provider webhooks  
**Main outputs:** `sales_order` documents, payment confirmation calls, storefront projection reads

**Current layout issue (roadmap P3-01):** The domain is split across two directories — `lib/modules/ecom/` (active service code) and `lib/modules/ecommerce/` (handlers, projections, cart). These will be merged.

---

### CRM / Party

**Responsible for:**
- `Party` — the unified identity record for any person or organization in the system
- `PartyLink` — the join table connecting a Party to its source identities (Customer, Counterparty, Telegram)
- `PartyActivity` — the timeline of business events for each Party (orders, payments, interactions)
- Identity resolution: given any identifier, resolve to a canonical Party
- Party merge: collapsing duplicate Party records

**Does NOT own:**
- `Customer` (owned by Auth / Ecommerce)
- `Counterparty` (owned by Accounting)
- Document or stock data

**Tenant Scoping Note:**
`Counterparty` is now **fully tenant-scoped at the schema level** (P4-09 complete). `tenantId` field has NOT NULL constraint with FK to `Tenant`. Test factory `createCounterparty()` enforces tenant truthfully via auto-create fallback pattern.

**Main inputs:** Counterparty creation, Customer creation, order placement, payment events  
**Main outputs:** Unified customer profile, activity timeline, merge-aware identity resolution

---

### Auth / Tenant

**Responsible for:**
- Admin user authentication (HMAC-signed session cookies)
- Customer authentication (Telegram Login Widget)
- RBAC: role → permissions mapping
- Tenant scoping: every authenticated request carries `tenantId`
- `Tenant` entity management

**Does NOT own:**
- Business entities (documents, stock, products)
- CRM data

**Main inputs:** Login requests, Telegram auth callbacks  
**Main outputs:** Signed session tokens, `TenantAwareSession` context for all downstream operations

---

### Events / Outbox

**Responsible for:**
- `OutboxEvent` table: the durable store of pending domain event deliveries
- `processOutboxEvents()`: the polling processor that dispatches events to registered handlers
- Handler registration (`registerOutboxHandler()`)
- Retry logic, failure tracking, dead-letter marking

**Does NOT own:**
- The business logic inside handlers (owned by the target domain)
- The events themselves (owned by the emitting domain service)

**Main inputs:** `createOutboxEvent(tx, event, ...)` calls from domain services  
**Main outputs:** Handler execution, side effects in Finance, Inventory, Ecommerce projections

**Outbox SLA (P2-08):**

| Parameter | Value | Source |
|-----------|-------|--------|
| Cron trigger interval | **60 seconds** | Infrastructure configuration (`OUTBOX_SECRET`-authenticated POST) |
| Max acceptable delay (normal load) | **120 seconds** (2 cron cycles) | SLA contract |
| Max retry attempts | **5** (`MAX_RETRIES` in `lib/events/outbox.ts`) | Code constant |
| Retry backoff | Exponential: `1000 × 2^attempt` ms | Code constant (`BASE_BACKOFF_MS = 1000`) |
| Backoff schedule | Attempt 1: 2s, 2: 4s, 3: 8s, 4: 16s, 5: 32s | Derived |
| Cumulative retry window | ~62 seconds before DEAD transition | Derived |
| Terminal state after max retries | `DEAD` (requires manual intervention) | P2-07 |
| Batch size per cron run | 10 events (default), max 100 | `DEFAULT_LIMIT` / `MAX_LIMIT` in cron route |

**Monitoring obligations:**
- Alert if `pending` count > 0 AND oldest `createdAt` > 2 minutes (missed cron cycle)
- Alert immediately on any event with `status = 'dead'`
- Alert if `status = 'failed'` count unexpectedly grows (possible handler regression)
- Check `GET /api/system/outbox/process` (health endpoint) returns `stats.dead = 0` and `stats.pending` is draining

---

### Projections

**Responsible for:**
- Read models derived from source-of-truth tables
- `ProductCatalogProjection`: storefront catalog (product + price + discount + reviews)
- `StockRecord`: current inventory levels per product per warehouse
- `CounterpartyBalance`: current financial balance per counterparty

**Does NOT own:**
- Source data (Products, StockMovements, JournalEntries)
- Business rules for how projections are computed (owned by builder functions)

**Main inputs:** Outbox event handlers call projection orchestrators  
**Main outputs:** Fast, pre-computed read models for UI and storefront queries

---

### Shared Infrastructure

**Responsible for:**
- `db` — the Prisma client singleton
- `auth.ts` / `authorization.ts` — session reading, permission enforcement
- `validation.ts` — Zod parsing utilities for routes
- `logger.ts` — structured logging
- `customer-auth.ts` — customer session signing/verification

**Does NOT own:**
- Any business domain logic

---

## 3. Domain Ownership Matrix

| Entity / Concern | Owning Domain | Why | Primary Write Path | Primary Read Path | Notes |
|-----------------|---------------|-----|-------------------|------------------|-------|
| `Document` | Accounting | Central business transaction record | `confirmDocumentTransactional()`, `cancelDocumentTransactional()` | Direct DB query in admin routes | State machine in `document-states.ts` |
| Document state machine | Accounting / Domain | Pure business rules, no DB | `validateTransition()` — called by services | Not applicable (pure function) | `lib/modules/accounting/document-states.ts` |
| `StockMovement` | Inventory | Immutable audit log of physical stock | `createMovementsForDocument()`, `createReversingMovements()` | Direct query by reports | Never updated after creation |
| `StockRecord` | Inventory | Projection of current stock | `reconcileStockRecord()` — called by movement service | Storefront stock checks, admin stock views | Derived from StockMovements |
| `Product` | Accounting (catalog) | Master product metadata | Product mutation routes → (target: product service) | Admin queries, ProductCatalogProjection builder | Source of truth for product data |
| `ProductCatalogProjection` | Ecommerce | Storefront read model | `updateProductCatalogProjection()` via outbox handler | Storefront catalog API | Eventual consistency; currently not trigger-connected (P2 gap) |
| `Counterparty` | Accounting | Accounting identity for external parties | `createCounterpartyWithParty()` (P1 canonical service) | Admin counterparty list | Must always have Party mirror |
| `Customer` | Auth (canonical write path). Ecommerce has a secondary guest-customer creation path (`quick-order/route.ts`). | Storefront user identity | Telegram auth route → `db.customer.create()` | Account pages, order history | Must produce Party mirror at creation (P2 gap). See also: Guest Customer Create write path. |
| `Party` | CRM | Unified identity across all sources | `resolveParty()` — called by `createCounterpartyWithParty()` | CRM party list, party profile | Created atomically with Counterparty (post P1) |
| `PartyLink` | CRM | Join: Party ↔ source entity | `resolveParty()` internal | `findPartyLink()` | Updated on merge (currently partial) |
| `JournalEntry` / `LedgerLine` | Finance | Double-entry bookkeeping | `onDocumentConfirmedJournal` handler (via outbox) | Finance reports | Async — created after outbox cron runs |
| `CounterpartyBalance` | Accounting (currently misplaced in `lib/modules/finance/reports.ts`; target: `accounting/services/balance.service.ts` via P3-03) | Materialized counterparty balance is an accounting aggregate, not a finance report | `recalculateBalance()` — called by outbox handler and cancel service | Balance list, document views | Write op will move to `accounting/services/balance.service.ts` (P3-03) |
| `Tenant` | Auth | Tenant registry | Manual / seed | Session resolution, all tenant-scoped queries | Backbone of multi-tenant isolation |
| `OutboxEvent` | Events | Durable event delivery log | `createOutboxEvent(tx, ...)` inside domain service transactions | `processOutboxEvents()` cron | Sole production event path |

---

## 4. Main Write Paths

### Product Create / Update

| | |
|--|--|
| **Trigger** | Admin UI (PUT `/api/accounting/products/[id]`) |
| **Owning service** | Product mutation route → direct DB (target: product service, P3) |
| **Transaction** | None currently (P2 gap) |
| **Emitted events** | None currently — `product.updated` should be emitted but is not (P2-01) |
| **Sync side effects** | None |
| **Async side effects** | `ProductCatalogProjection` update — **currently missing** (P2 gap) |
| **Invariant** | Product → ProductCatalogProjection (INV-04, currently MISSING) |

---

### Sale Price / Discount Update

| | |
|--|--|
| **Trigger** | Admin UI price or discount routes |
| **Owning service** | Price/discount mutation routes → direct DB |
| **Transaction** | None currently (P2 gap) |
| **Emitted events** | `sale_price.updated` / `discount.updated` — **not yet emitted** (P2-02, P2-03) |
| **Async side effects** | ProductCatalogProjection stale until manual rebuild |
| **Invariant** | Price/Discount → ProductCatalogProjection (INV-04, currently MISSING) |

---

### Customer Create (Telegram Auth)

| | |
|--|--|
| **Trigger** | Telegram Login Widget callback (POST `/api/auth/customer/telegram`) |
| **Owning service** | Auth route → `db.customer.create()` |
| **Transaction** | Single write, no transaction |
| **Emitted events** | None |
| **Sync side effects** | None |
| **Async side effects** | Party mirror created lazily on first order — **not at creation** (P2 gap) |
| **Invariant** | Customer → Party (INV-02, currently MISSING) |

---

### Counterparty Create (Admin)

| | |
|--|--|
| **Trigger** | Admin UI (POST `/api/accounting/counterparties`) |
| **Owning service** | `createCounterpartyWithParty()` — canonical service (P1 complete) |
| **Transaction** | Counterparty created, then Party via `resolveParty()` with compensating delete on failure |
| **Emitted events** | None |
| **Sync side effects** | Party + PartyLink created in CRM |
| **Async side effects** | None |
| **Invariant** | Counterparty → Party (INV-01, now MEDIUM — compensating pattern, not true single transaction) |

---

### Customer First Order → Counterparty Bridge

| | |
|--|--|
| **Trigger** | First `createSalesOrderFromCart()` call for a customer without a Counterparty |
| **Owning service** | `getOrCreateCounterparty()` in `lib/modules/ecom/orders.ts` → `createCounterpartyWithParty()` (P1 complete) |
| **Transaction** | `createCounterpartyWithParty()` compensating pattern + separate `db.customer.update()` |
| **Emitted events** | None |
| **Sync side effects** | Counterparty + Party created; `customer.counterpartyId` updated |
| **Invariant** | Customer → Counterparty (INV-03), Counterparty → Party (INV-01) |

---

### Document Confirm

| | |
|--|--|
| **Trigger** | Admin confirm action, ecom payment webhook |
| **Owning service** | `confirmDocumentTransactional()` in `document-confirm.service.ts` |
| **Transaction** | Steps 1–5 sequential (idempotent); step 6 (status + outbox event) in single `db.$transaction()` |
| **Emitted events** | `DocumentConfirmed` — written atomically with status update |
| **Sync side effects** | StockMovements created, StockRecord reconciled, average costs updated |
| **Async side effects** | CounterpartyBalance recalculated, JournalEntry created, Payment record created — all via outbox cron |
| **Invariant** | Document confirm → Stock (INV-05, STRONG); → Journal (INV-07, MEDIUM); → Balance (INV-06, MEDIUM) |

---

### Document Cancel

| | |
|--|--|
| **Trigger** | Admin cancel action (POST `/api/accounting/documents/[id]/cancel`) |
| **Owning service** | `cancelDocumentTransactional()` in `document-confirm.service.ts` (P1-01 complete) |
| **Transaction** | Status update as single DB call; stock reversal and balance recalc sequential (idempotent) |
| **Emitted events** | None currently (DocumentCancelled event planned for Phase 1.5+) |
| **Sync side effects** | Reversing StockMovements created; CounterpartyBalance recalculated |
| **Async side effects** | None currently |
| **Invariant** | Document cancel → Reversal movements (INV-05, now STRONG after P1-01) |

---

### Order Payment Confirm (Ecommerce)

| | |
|--|--|
| **Trigger** | Payment webhook (T-Bank) or admin UI payment confirmation |
| **Owning service** | `confirmEcommerceOrderPayment()` — canonical merged function (P1-05 complete) |
| **Transaction** | `paymentStatus` update separate from `confirmDocumentTransactional()` (known split — idempotency guard present) |
| **Emitted events** | `DocumentConfirmed` (via `confirmDocumentTransactional()`) |
| **Sync side effects** | StockMovements created |
| **Async side effects** | Balance, Journal, Payment via outbox cron; Party activity recorded synchronously |
| **Invariant** | Payment mark → Document confirm (INV-08, MEDIUM — not fully atomic) |

---

### Party Merge

| | |
|--|--|
| **Trigger** | CRM admin merge action |
| **Owning service** | `lib/party/services/` merge service |
| **Transaction** | Sets `party.status = "merged"`, `party.mergedIntoId`; does not yet update PartyLinks (P3-08 gap) |
| **Emitted events** | None |
| **Sync side effects** | Merge chain established |
| **Async side effects** | None |
| **Invariant** | Party merge → PartyLink consistency (INV-12, MEDIUM — `resolveFinalParty()` traversal works, direct DB queries do not; fix scheduled P3-08) |

---

### Guest Customer Create (Quick Order)

| | |
|--|--|
| **Trigger** | Checkout via `POST /api/ecommerce/orders/quick-order` (no existing customer session) |
| **Owning service** | Quick-order route → `db.customer.create()` with synthetic `telegramId` |
| **Transaction** | Single write, no transaction |
| **Emitted events** | None |
| **Sync side effects** | None |
| **Async side effects** | Party mirror **not created** at time of guest creation (P2 gap) |
| **Invariant** | Customer → Party (INV-02, MISSING — same gap as Telegram auth path; fix scheduled P2-05) |

---

## 5. Event Flow Map

### Production Event Architecture

```
Domain Service
  └─ db.$transaction()
       ├─ [domain writes]
       └─ createOutboxEvent(tx, event)  ← written atomically
            └─ OutboxEvent { status: "pending" }

              ↓ (cron trigger: POST /api/system/outbox/process — every 60s)

       processOutboxEvents()
            └─ registerOutboxHandler(eventType, handler)
                 └─ handler(event.payload)
                      ├─ SUCCESS → status = PROCESSED
                      ├─ FAILURE (attempts < 5) → status = PENDING, availableAt = now + backoff
                      └─ FAILURE (attempts >= 5) → status = DEAD + logger.error()
```

**SLA:** Event write → handler execution within **120 seconds** under normal load (2 × 60s cron cycles).

`IEventBus` (`InProcessEventBus`) is **test infrastructure only**. It is not called in any production code path.

> **Operational notes:** All outbox handlers must be registered in **both** `app/api/system/outbox/process/route.ts` (HTTP cron trigger) and `scripts/process-outbox.ts` (CLI trigger). Registering in only one location is a deployment gap. Handlers must be **idempotent** — safe to execute multiple times for the same event without producing duplicate effects.

---

### Event Registry

| Event Type | Emitted By | Written Where | Processed By (Handlers) | Effects | Sync/Async |
|-----------|-----------|--------------|------------------------|---------|-----------|
| `DocumentConfirmed` | `confirmDocumentTransactional()` | Inside `db.$transaction()` with status update | `onDocumentConfirmedBalance`, `onDocumentConfirmedJournal`, `onDocumentConfirmedPayment` | Balance recalc, journal entries, payment record | **Async** (outbox cron) |
| `product.updated` | *Not yet emitted* (P2-01 gap) | — | `onProductCatalogUpdated` | ProductCatalogProjection upsert | **Async** (outbox cron) — pending |
| `sale_price.updated` | *Not yet emitted* (P2-02 gap) | — | `onProductCatalogUpdated` | ProductCatalogProjection upsert | **Async** (outbox cron) — pending |
| `discount.updated` | *Not yet emitted* (P2-03 gap) | — | `onProductCatalogUpdated` | ProductCatalogProjection upsert | **Async** (outbox cron) — pending |

### Current Event Gaps

Three event types (`product.updated`, `sale_price.updated`, `discount.updated`) have registered handlers and are correctly wired in the outbox processor — but no mutation route currently emits them. This means the `ProductCatalogProjection` is updated only by manual rebuild scripts.

This is **P2-01/02/03** in the normalization roadmap.

---

## 6. Projection Map

### ProductCatalogProjection

| | |
|--|--|
| **Purpose** | Pre-computed storefront catalog: product metadata + current price + active discount + review stats + variant count |
| **Source of truth** | `Product`, `SalePrice`, `ProductDiscount`, `Review`, `ProductCategory`, `Unit` |
| **Owner** | Ecommerce (`lib/modules/ecommerce/projections/`) |
| **Update trigger (target)** | Outbox events: `product.updated`, `sale_price.updated`, `discount.updated` → `onProductCatalogUpdated` handler → `updateProductCatalogProjection()` |
| **Update trigger (current)** | Manual rebuild script only (`scripts/rebuild-product-catalog-projection.ts`) |
| **Builder pattern** | Yes — `product-catalog.builder.ts` (pure, returns `{action: "upsert"\|"delete"\|"skip"}`) + `product-catalog.projection.ts` (orchestrator, performs DB upsert) |
| **Consistency model** | Eventual (outbox cron SLA) — currently broken (no emission) |
| **Recovery** | `rebuild-product-catalog-projection.ts` — full rebuild via raw SQL |
| **Maturity** | YELLOW — projection infrastructure is correct; emission wiring is missing (P2 gap) |

---

### StockRecord

| | |
|--|--|
| **Purpose** | Current stock quantity per product per warehouse |
| **Source of truth** | `StockMovement` (immutable movement log) |
| **Owner** | Inventory (`lib/modules/accounting/inventory/stock-movements.ts`) |
| **Update trigger** | `reconcileStockRecord()` called inside `createMovementsForDocument()` — synchronous, within document confirmation flow |
| **Builder pattern** | No — direct aggregation and upsert inside `reconcileStockRecord()` |
| **Consistency model** | **Strong** — updated synchronously before document status is written |
| **Recovery** | Re-run `createMovementsForDocument()` (idempotent) or full re-aggregation from movements |
| **Maturity** | YELLOW — canonical path is correct; legacy `recalculateStock()` path still exists alongside it (P3-04) |

---

### CounterpartyBalance

| | |
|--|--|
| **Purpose** | Current financial balance (receivables/payables) per counterparty |
| **Source of truth** | Confirmed `Document` records (aggregated) |
| **Owner** | Accounting (currently misplaced in `lib/modules/finance/reports.ts`; moving to `accounting/services/balance.service.ts` via P3-03) |
| **Update trigger** | `onDocumentConfirmedBalance` outbox handler (async) + direct call in `cancelDocumentTransactional()` (sync) |
| **Builder pattern** | No — `recalculateBalance()` does 6 aggregate queries and writes result |
| **Consistency model** | Mixed — cancel is synchronous; confirm is async via outbox cron |
| **Recovery** | Re-run `recalculateBalance(counterpartyId)` manually |
| **Maturity** | YELLOW — write operation misplaced in read module; will move to `accounting/services/balance.service.ts` (P3-03) |

---

## 7. Cross-Module Invariant Map

| # | Source Entity | Target / Effect | Enforcement Owner | Sync or Async | Current Reliability | Target Reliability |
|---|--------------|-----------------|-------------------|---------------|--------------------|--------------------|
| INV-01 | `Counterparty` created | `Party` + `PartyLink` in CRM | `createCounterpartyWithParty()` | Sync (compensating pattern) | **MEDIUM** | STRONG (true transaction) |
| INV-02 | `Customer` created | `Party` + `PartyLink` in CRM | *Missing* — Party created on first order only | Lazy / MISSING | **MISSING** | STRONG (P2-04) |
| INV-03 | `Customer` first order | `Counterparty` bridge | `getOrCreateCounterparty()` → `createCounterpartyWithParty()` | Sync | **MEDIUM** | STRONG |
| INV-04 | `Product` / `SalePrice` / `Discount` mutated | `ProductCatalogProjection` update | *Missing* — no outbox event emitted from mutation routes | Async / MISSING | **MISSING** | MEDIUM-STRONG (P2-01/02/03) |
| INV-05a | Document confirmed | `StockMovement` + `StockRecord` | `confirmDocumentTransactional()` | Sync | **STRONG** | STRONG |
| INV-05b | Document cancelled | Reversing `StockMovement` | `cancelDocumentTransactional()` (P1-01 complete) | Sync | **MEDIUM** (route delegates to service; status update and reversing movements are sequential DB calls, not one atomic transaction) | STRONG (requires full transaction unification) |
| INV-06 | Document confirmed | `CounterpartyBalance` recalculated | `onDocumentConfirmedBalance` outbox handler | Async | **MEDIUM** | MEDIUM-STRONG |
| INV-13 | Document cancelled | `CounterpartyBalance` recalculated | Direct `recalculateBalance()` call inside `cancelDocumentTransactional()` | Sync | **MEDIUM** (synchronous but not in same transaction as status update) | MEDIUM-STRONG |
| INV-07 | Document confirmed | `JournalEntry` + `LedgerLine` | `onDocumentConfirmedJournal` outbox handler | Async | **MEDIUM** | MEDIUM-STRONG |
| INV-08 | Payment marked paid | Document confirmed (near-atomic) | `confirmEcommerceOrderPayment()` (P1-05 merged) | Sync (split write, idempotency guard) | **MEDIUM** | **MEDIUM (accepted)** — idempotency guard ensures webhook retry safety; full single-transaction atomicity not scheduled |
| INV-09 | `Product` created | Has `tenantId` | Route + service layer | Sync / no DB constraint yet | **MEDIUM** | STRONG (P4-01) |
| INV-10 | `Document` created | Has `tenantId` matching warehouse | Route + service layer | Sync / no DB constraint yet | **MEDIUM** | STRONG (P4-02) |
| INV-11 | Domain event fired | Goes through outbox only (not IEventBus) | Architecture rule — `IEventBus` not wired in production | N/A | **WEAK** (dual wiring) | STRONG (P2-06) |
| INV-12 | Party merged | All `PartyLink` records point to survivor | `executeMerge()` updates PartyLink records atomically inside `db.$transaction()` | Sync transaction | **STRONG** | STRONG ✅ |

---

## 8. Source of Truth Map

### Canonical Sources of Truth

| Entity | Category | Canonical? | Notes |
|--------|----------|-----------|-------|
| `Product` | Source of truth | ✅ Yes | Master product metadata — all fields are authoritative |
| `SalePrice` | Source of truth | ✅ Yes | Current active price (latest `isActive=true` row) |
| `ProductDiscount` | Source of truth | ✅ Yes | Active discount rules |
| `StockMovement` | Source of truth | ✅ Yes | Immutable append-only log; never updated after creation |
| `Document` + `DocumentItem` | Source of truth | ✅ Yes | Business transaction record |
| `JournalEntry` + `LedgerLine` | Source of truth | ✅ Yes | Accounting record — immutable once posted |
| `Counterparty` | Source of truth | ✅ Yes | Accounting identity |
| `Customer` | Source of truth | ✅ Yes | Storefront identity |
| `Party` | Source of truth | ✅ Yes | Unified CRM identity (resolves Counterparty + Customer) |
| `OutboxEvent` | Source of truth | ✅ Yes | Durable record of pending event deliveries |
| `Tenant` | Source of truth | ✅ Yes | Tenant registry |

### Derived State (Projections)

| Entity | Derived From | Consistency |
|--------|-------------|-------------|
| `StockRecord` | `StockMovement` aggregate | Strong (updated synchronously in confirm flow) |
| `ProductCatalogProjection` | `Product` + `SalePrice` + `ProductDiscount` + `Review` | Eventual (currently broken — no emission) |
| `CounterpartyBalance` | Confirmed `Document` aggregate | Mixed (sync on cancel, async on confirm) |

### Mirrors

| Entity | Mirrors | Mirror Quality |
|--------|---------|---------------|
| `Party` | Mirrors `Counterparty` and/or `Customer` | MEDIUM — atomic for Counterparty (post P1); lazy for Customer (pre P2) |
| `PartyLink` | Junction between Party and source entities | STRONG — updated atomically on merge (reassigned to survivor in `executeMerge()` transaction) |

---

## 9. Current Architectural Risk Zones

### RISK-01: ProductCatalogProjection Emission Gap

**What:** Storefront product catalog is a stale snapshot. Every admin edit to a product, price, or discount since the last manual rebuild is invisible to customers.

**Why dangerous:** Customers see outdated prices and product information. The fix infrastructure (handlers, registration, outbox processor) is fully built — the only missing piece is the emission call from the three mutation routes.

**Roadmap:** P2-01, P2-02, P2-03

---

### RISK-02: Customer → Party Mirror Missing

**What:** Customers created via Telegram auth or as quick-order guests have no `Party` record in CRM. The Party is created lazily on first order placement, or never if they never order.

**Why dangerous:** CRM queries are blind to these customers. Search, timeline, and merge features cannot find them. The backfill script (`backfill-party-counterparties.ts`) exists as evidence this already caused production data gaps.

**Roadmap:** P2-04, P2-05

---

### RISK-03: Dual Event Infrastructure (IEventBus vs. Outbox)

**What:** `registerAccountingHandlers(bus)` wires accounting handlers into `IEventBus`. `IEventBus.publish()` is never called in production. All handlers actually fire through the outbox. A developer who adds a new handler only to `IEventBus` will find it silently never executes in production.

**Why dangerous:** Invisible correctness gap. New handlers appear registered, tests may pass, but production effects never fire.

**Roadmap:** P2-06

---

### RISK-04: `recalculateStock()` Legacy Path

**What:** `lib/modules/accounting/inventory/stock.ts` still exports `recalculateStock()` and `updateStockForDocument()` — a legacy document-aggregate approach to stock calculation. The canonical path is `reconcileStockRecord()` via `createMovementsForDocument()` (movement-sum approach). Both coexist.

**Why dangerous:** A developer consulting the wrong function gets a different (and less reliable) stock calculation. Two sources of truth for inventory state.

**Roadmap:** P3-04

---

### RISK-05: `lib/modules/ecom/` vs `lib/modules/ecommerce/` Split

**What:** The ecommerce domain is split across two directories with no documented reason. `ecom/orders.ts` is a 642-line god file. New ecommerce code has no clear home.

**Why dangerous:** Navigation failure — developers cannot find canonical code; new code lands in the wrong place; god file grows.

**Roadmap:** P3-01, P3-02

---

### RISK-06: Tenant Isolation Not Enforced at DB Level

**What:** `Product.tenantId`, `Document.tenantId`, `ProductVariant.tenantId` do not yet have `NOT NULL` + FK constraints. Enforcement is runtime-only (service parameter). Backfill scripts were run but schema migration not yet applied.

**Why dangerous:** A bug or migration error could write NULL tenantId rows, making data visible across tenants.

**Roadmap:** P4-01, P4-02, P4-03

---

## 10. Dependency Rules Between Domains

### Allowed Dependency Directions

```
HTTP Request
    │
    ▼
app/api/**/*.ts (Route layer)
    │  may call →
    ▼
lib/modules/<domain>/services/    ← writes, transactions, orchestration
lib/modules/<domain>/queries/     ← reads
lib/shared/authorization.ts       ← auth
lib/shared/validation.ts          ← input parsing
    │  may call →
    ▼
lib/modules/<domain>/domain/      ← pure business rules
lib/events/outbox.ts              ← event emission (inside transaction)
lib/party/                        ← identity resolution
    │  calls →
    ▼
lib/shared/db.ts                  ← Prisma client (services and queries only)
```

### Cross-Module Import Rule

A module may only be imported via its `index.ts` barrel.

```
✅  import { cancelDocumentTransactional } from "@/lib/modules/accounting/services/document-confirm.service"
    (direct service import — acceptable for now, target: via index.ts barrel)

✅  import { resolveParty } from "@/lib/party"
    (via public barrel — correct)

❌  import { recalculateBalance } from "@/lib/modules/finance/reports"
    (internal path, not through barrel)

❌  import { reconcileStockRecord } from "@/lib/modules/accounting/inventory/stock-movements"
    (internal path, not through barrel)
```

### Forbidden Dependencies

| Forbidden | Reason |
|-----------|--------|
| Route → `lib/shared/db` | Routes do not own DB access |
| Domain function → `lib/shared/db` | Domain must be pure |
| Handler → another handler | Handlers are independent reactions |
| Projection orchestrator → service | Projections update read models only |
| Module A internal → Module B internal (bypassing barrel) | Modules are black boxes |

---

## 11. Current vs Target State

| Area | Current State | Target State | Roadmap Phase |
|------|--------------|--------------|---------------|
| Document cancel path | Service exists (`cancelDocumentTransactional`); P1-01 complete | Route delegates fully to service — ✅ **Done** | P1-01 |
| Counterparty creation | `createCounterpartyWithParty()` service exists; compensating pattern | True atomic transaction (requires `resolveParty` tx-aware) | P1-02 → P3 |
| Customer CRM mirror | Party created lazily on first order | Party created at Customer creation in auth route | P2-04/05 |
| Projection update trigger | `ProductCatalogProjection` updated only by manual rebuild | Outbox events `product.updated` / `sale_price.updated` / `discount.updated` trigger automatic updates | P2-01/02/03 |
| Event infrastructure | Dual: `IEventBus` (dead) + outbox (live) | Outbox only; `IEventBus` test-only | P2-06 |
| Payment confirmation | Two duplicate functions (`confirmOrderPayment` + `confirmEcommerceOrderPayment`) — P1-05 complete | One canonical function — ✅ **Done** | P1-05 |
| Ecommerce module layout | Split across `ecom/` (god file) and `ecommerce/` (handlers, projections) | Single `ecommerce/` with service-level split | P3-01/02 |
| Stock calculation paths | Two paths: `recalculateStock()` (legacy) + `reconcileStockRecord()` (canonical) | One canonical path — legacy removed | P3-04 |
| `recalculateBalance()` location | Misplaced in `finance/reports.ts` (read module) | Moved to `accounting/services/balance.service.ts` | P3-03 |
| Tenant DB enforcement | Runtime only (service parameter) | `NOT NULL` + FK constraint in schema | P4-01/02/03 |
| `publishDocumentConfirmed()` | Dead no-op function still exported | Removed | P3-07 |
| Test factories | 923-line monolith `factories.ts` | Domain-scoped factory files | P3-05/06 |
| StockRecord consistency verification | No verify script exists for StockRecord (unlike ProductCatalogProjection) | `verify-stock-record.ts` script validates StockRecord aggregates against StockMovements | P3-04 sub-task or P4 |
| Party merge PartyLink consistency | Merge sets `party.status` only; PartyLinks not re-pointed | Merge atomically re-points all PartyLinks to survivor | P3-08 |
| ESLint / CI gates | Manual review only | ESLint blocks `db` in routes; CI runs verify gates | P4-04/05/06 |

---

## 12. Operational Summary

### The 3 Most Central Domains

1. **Accounting** — owns the Document model, the state machine, and Counterparty. All business transactions start and end here. Every other domain either feeds Accounting (Ecommerce) or reacts to it (Finance, Inventory, CRM).

2. **Inventory** — owns the canonical stock record. `StockMovement` is the event log that never lies. `StockRecord` is its projection. Correct inventory state is a prerequisite for financial accuracy.

3. **Events / Outbox** — the nervous system of the ERP. Every cross-domain side effect (balance, journal, projection) runs through the outbox. If the outbox is healthy, the system is eventually consistent. If it fails silently, financial and CRM data drift without any visible error.

---

### The 3 Most Important Invariants

1. **Document confirm → StockMovements** (INV-05a): Stock must be correct the moment a document is confirmed. This is synchronous and STRONG — the foundation of inventory accuracy.

2. **Counterparty → Party / Customer → Party** (INV-01/02): Every entity that represents a person or company must have a CRM Party record. Without this, the customer 360-degree view is incomplete and CRM queries silently miss real customers.

3. **Product/Price/Discount → ProductCatalogProjection** (INV-04): This is currently MISSING. The storefront is running on stale data. This is the most impactful open invariant gap.

---

### The 3 Most Dangerous Architectural Weaknesses Right Now

1. **RISK-01 — Stale storefront projection.** Handlers are registered and wired. Events are defined. Nothing emits them. Every product change since the last manual rebuild is invisible to customers. One bad rebuild run = permanent stale data.

2. **RISK-03 — Dead IEventBus wiring.** `registerAccountingHandlers(bus)` is wired at boot but `eventBus.publish()` is never called. This is a trap: any developer who adds a handler to `IEventBus` thinking it is the production path will find their code silently never runs.

3. **RISK-06 — Tenant isolation without DB enforcement.** The runtime rules are correct, but a single bug in a service or a migration error can produce NULL `tenantId` rows, making data cross-visible between tenants with no constraint to stop it.

---

### What the System Will Look Like When Normalization Is Complete

- **Every write operation** has one canonical service. No logic lives in routes. No duplicate paths exist.
- **Every product mutation** automatically triggers a storefront projection update within one cron cycle.
- **Every Counterparty and Customer** created in any flow — admin, ecommerce, quick-order — produces a Party record atomically.
- **The outbox** is the only event path. `IEventBus` is used only in unit tests. Dead infrastructure is removed.
- **Tenant isolation** is enforced at the database level with NOT NULL constraints, backed by verified backfills.
- **The module structure** is navigable: one directory per domain, one file per service, clear barrel exports. A new developer can find the owner of any operation in under a minute.
- **CI prevents regressions**: ESLint blocks `db` imports in routes; verify scripts run on every PR.

---

*This map reflects the system state as of March 2026. Phase 1 normalization tasks (P1-01 through P1-05) are complete.*  
*Refer to `.qoder/specs/erp-normalization-roadmap.md` for the execution plan.*  
*Refer to `.qoder/specs/erp-architecture-guardrails.md` for the permanent architectural rules.*

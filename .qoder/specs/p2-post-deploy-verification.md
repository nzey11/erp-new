# Phase 2 — Post-Deploy Verification Report

**Date:** 2026-03-14  
**Status:** COMPLETE — ALL PHASE 2 TASKS VERIFIED  
**Deployed Commit:** `ce8327b` — `feat(phase2): complete P2-01 through P2-08 normalization tasks`

---

## Executive Summary

Phase 2 has been successfully deployed to production. All 8 tasks (P2-01 through P2-08) are fully implemented and operational. The verification confirms:

- All outbox event emissions are in place (product.updated, sale_price.updated, discount.updated)
- Party mirror creation is active for new Customers (Telegram auth + quick-order)
- IEventBus is no longer wired in production bootstrap
- Outbox DEAD status is operational with proper logging
- All handlers are registered in both cron endpoint and CLI processor
- Documentation is synchronized with code

**Final Verdict:** ✅ **READY**

---

## 1. Codebase Verification

### 1.1 Outbox Event Emissions

| Event | File | Location | Status |
|-------|------|----------|--------|
| `product.updated` | `app/api/accounting/products/[id]/route.ts` | Lines 84-89 (inside PUT handler transaction) | ✅ Present |
| `sale_price.updated` | `app/api/accounting/products/[id]/route.ts` | Lines 111-116 (inside salePrice mutation transaction) | ✅ Present |
| `discount.updated` | `app/api/accounting/products/[id]/discounts/route.ts` | Lines 93-98 (POST), Lines 130-135 (DELETE) | ✅ Present |

### 1.2 resolveParty() Calls

| Location | File | Lines | Pattern | Status |
|----------|------|-------|---------|--------|
| Telegram auth | `app/api/auth/customer/telegram/route.ts` | 103-114 | try/catch with graceful degradation | ✅ Present |
| Quick-order guest | `app/api/ecommerce/orders/quick-order/route.ts` | 94-105 | try/catch with graceful degradation | ✅ Present |

Both implementations:
- Call `resolveParty({ customerId })` for new customers only
- Use try/catch that logs failure without re-throwing
- Do not block the primary flow (auth/order) on Party creation failure

### 1.3 bootstrapDomainEvents() Production No-Op

| File | Status |
|------|--------|
| `lib/bootstrap/domain-events.ts` | ✅ No-op — contains only guard and comment explaining P2-06 |

The file explicitly states:
> "P2-06: This function is intentionally a no-op. The IEventBus / registerAccountingHandlers() wiring has been removed from the production boot path."

### 1.4 Outbox DEAD Status Handling

| File | Lines | Implementation |
|------|-------|----------------|
| `lib/events/outbox.ts` | 122-166 | `markOutboxFailed()` transitions to DEAD when `newAttempts >= MAX_RETRIES` |
| `lib/events/outbox.ts` | 146-153 | `logger.error()` emitted on DEAD transition with full context |

### 1.5 getOutboxStats() Exposing `dead`

| File | Lines | Implementation |
|------|-------|----------------|
| `lib/events/outbox.ts` | 171-199 | Return type includes `dead: number`; counts `status === "DEAD"` |

---

## 2. Event Architecture Verification

### 2.1 No Production eventBus.publish() Calls

```bash
$ grep -r "eventBus\.publish(" --include="*.ts" .
# No matches found
```

✅ **CONFIRMED:** Zero production call sites for `eventBus.publish()`.

### 2.2 IEventBus Not Wired in Production Bootstrap

| Check | Result |
|-------|--------|
| `lib/bootstrap/domain-events.ts` | No-op function, no imports of `eventBus` or `registerAccountingHandlers` |
| `instrumentation.ts` | Calls `bootstrapDomainEvents()` but it's a no-op |

✅ **CONFIRMED:** IEventBus is not wired during production bootstrap.

### 2.3 All Relevant Events Delivered Through Outbox

| Event Type | Emitted By | Handled By | Registration Location |
|------------|------------|------------|----------------------|
| `DocumentConfirmed` | `confirmDocumentTransactional()` | `onDocumentConfirmedBalance`, `onDocumentConfirmedJournal`, `onDocumentConfirmedPayment` | `app/api/system/outbox/process/route.ts` (lines 43-45), `scripts/process-outbox.ts` (lines 31-33) |
| `product.updated` | `app/api/accounting/products/[id]/route.ts` PUT | `onProductCatalogUpdated` | `app/api/system/outbox/process/route.ts` (line 48), `scripts/process-outbox.ts` (line 36) |
| `sale_price.updated` | `app/api/accounting/products/[id]/route.ts` PUT | `onProductCatalogUpdated` | `app/api/system/outbox/process/route.ts` (line 49), `scripts/process-outbox.ts` (line 37) |
| `discount.updated` | `app/api/accounting/products/[id]/discounts/route.ts` | `onProductCatalogUpdated` | `app/api/system/outbox/process/route.ts` (line 50), `scripts/process-outbox.ts` (line 38) |

✅ **CONFIRMED:** All events are delivered through the outbox. All handlers are registered in **both** the HTTP cron endpoint and the CLI processor.

### 2.4 Outbox Handler Registry

| Handler | File | Event Type |
|---------|------|------------|
| `onDocumentConfirmedBalance` | `lib/modules/accounting/handlers/balance-handler.ts` | `DocumentConfirmed` |
| `onDocumentConfirmedJournal` | `lib/modules/accounting/handlers/journal-handler.ts` | `DocumentConfirmed` |
| `onDocumentConfirmedPayment` | `lib/modules/accounting/handlers/payment-handler.ts` | `DocumentConfirmed` |
| `onProductCatalogUpdated` | `lib/modules/ecommerce/handlers/catalog-handler.ts` | `product.updated`, `sale_price.updated`, `discount.updated` |

---

## 3. Outbox Processor Verification

### 3.1 Configuration Constants

| Constant | Value | File | Line |
|----------|-------|------|------|
| `MAX_RETRIES` | 5 | `lib/events/outbox.ts` | 22 |
| `BASE_BACKOFF_MS` | 1000 | `lib/events/outbox.ts` | 23 |
| `DEFAULT_LIMIT` | 10 | `app/api/system/outbox/process/route.ts` | 54 |
| `MAX_LIMIT` | 100 | `app/api/system/outbox/process/route.ts` | 55 |

### 3.2 Terminal State = DEAD

```typescript
// lib/events/outbox.ts lines 135-144
if (newAttempts >= MAX_RETRIES) {
  // Terminal state — max retries exhausted
  await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "DEAD",  // ← Terminal state
      attempts: newAttempts,
      lastError: error.message,
    },
  });
```

✅ **CONFIRMED:** Terminal state is `DEAD`, not `FAILED`.

### 3.3 DEAD Transition Logs Error

```typescript
// lib/events/outbox.ts lines 146-153
logger.error("outbox", "Outbox event moved to DEAD — max retries exhausted", {
  eventId,
  eventType: event.eventType,
  aggregateType: event.aggregateType,
  aggregateId: event.aggregateId,
  attempts: newAttempts,
  lastError: error.message,
});
```

✅ **CONFIRMED:** DEAD transition emits structured error log.

### 3.4 Exponential Backoff

```typescript
// lib/events/outbox.ts lines 29-32
function calculateBackoff(attempts: number): Date {
  const delayMs = BASE_BACKOFF_MS * Math.pow(2, attempts);
  return new Date(Date.now() + delayMs);
}
```

**Backoff Schedule:**

| Attempt | Backoff | Cumulative |
|---------|---------|------------|
| 1 | 2s | 2s |
| 2 | 4s | 6s |
| 3 | 8s | 14s |
| 4 | 16s | 30s |
| 5 (DEAD) | 32s | ~62s |

✅ **CONFIRMED:** Exponential backoff exists and is applied.

### 3.5 getOutboxStats() Exposes dead Count

```typescript
// lib/events/outbox.ts lines 191-197
return {
  pending: stats.find((s) => s.status === "PENDING")?._count ?? 0,
  processing: stats.find((s) => s.status === "PROCESSING")?._count ?? 0,
  processed: stats.find((s) => s.status === "PROCESSED")?._count ?? 0,
  failed: stats.find((s) => s.status === "FAILED")?._count ?? 0,
  dead: stats.find((s) => s.status === "DEAD")?._count ?? 0,  // ← Exposed
  oldestPendingAt: oldestPending?.createdAt,
};
```

✅ **CONFIRMED:** `dead` count is exposed in stats.

### 3.6 Retry Lifecycle (Step-by-Step)

```
1. Event created with status="PENDING", attempts=0, availableAt=NOW()
   ↓
2. Cron triggers POST /api/system/outbox/process
   ↓
3. claimOutboxEvents() atomically claims pending events
   → UPDATE status="PROCESSING" WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
   ↓
4. For each claimed event:
   a. Execute registered handlers
   b. If SUCCESS → markOutboxProcessed() → status="PROCESSED"
   c. If FAILURE → markOutboxFailed()
      i. If attempts + 1 >= 5 → status="DEAD" + logger.error()
      ii. If attempts + 1 < 5 → status="PENDING" + availableAt=NOW()+backoff
   ↓
5. Return result stats to cron caller
```

---

## 4. Projection Update Verification

### 4.1 Event → Handler → Projection Flow

| Event | Handler | Projection Function |
|-------|---------|---------------------|
| `product.updated` | `onProductCatalogUpdated` | `updateProductCatalogProjection(productId)` |
| `sale_price.updated` | `onProductCatalogUpdated` | `updateProductCatalogProjection(productId)` |
| `discount.updated` | `onProductCatalogUpdated` | `updateProductCatalogProjection(productId)` |

### 4.2 Flow Trace

```
Mutation Route
  └─ db.$transaction()
       ├─ tx.product.update() / tx.salePrice.create() / tx.productDiscount.create()
       └─ createOutboxEvent(tx, { type: "product.updated" | "sale_price.updated" | "discount.updated", payload: { productId } })
            └─ OutboxEvent row created atomically

Cron (every 60s)
  └─ POST /api/system/outbox/process
       └─ processOutboxEvents()
            └─ claimOutboxEvents() → status="PROCESSING"
                 └─ processEvent() → handlerRegistry.get(eventType)
                      └─ onProductCatalogUpdated(event)
                           └─ updateProductCatalogProjection(productId)
                                ├─ buildProductCatalogProjection(productId) [pure builder]
                                └─ db.productCatalogProjection.upsert() [orchestrator]
```

### 4.3 Files Responsible

| Step | File | Responsibility |
|------|------|----------------|
| Mutation | `app/api/accounting/products/[id]/route.ts` | Product update + outbox emission (P2-01, P2-02) |
| Mutation | `app/api/accounting/products/[id]/discounts/route.ts` | Discount create/delete + outbox emission (P2-03) |
| Handler | `lib/modules/ecommerce/handlers/catalog-handler.ts` | Route event to projection update |
| Builder | `lib/modules/ecommerce/projections/product-catalog.builder.ts` | Pure function: compute projection state |
| Orchestrator | `lib/modules/ecommerce/projections/product-catalog.projection.ts` | DB upsert/delete based on builder result |

---

## 5. Invariant Verification

| Invariant | Description | Current Status | Enforcement Location |
|-----------|-------------|----------------|---------------------|
| INV-01 | Counterparty → Party | **MEDIUM** | `createCounterpartyWithParty()` in `lib/modules/accounting/services/counterparty.service.ts` — compensating pattern (creates Counterparty, then Party, deletes Counterparty on Party failure) |
| INV-02 | Customer → Party | **MEDIUM** | `resolveParty({ customerId })` called in try/catch in `app/api/auth/customer/telegram/route.ts` (P2-04) and `app/api/ecommerce/orders/quick-order/route.ts` (P2-05) — graceful degradation, backfillable |
| INV-03 | Customer → Counterparty | **MEDIUM** | `getOrCreateCounterparty()` in `lib/modules/ecom/orders.ts` → calls `createCounterpartyWithParty()` |
| INV-04 | Product → ProductCatalogProjection | **MEDIUM-STRONG** | Outbox events (`product.updated`, `sale_price.updated`, `discount.updated`) → `onProductCatalogUpdated` → `updateProductCatalogProjection()` — P2-01/02/03 complete |
| INV-05 | Document → Stock movements | **STRONG** | `confirmDocumentTransactional()` creates movements synchronously inside transaction |
| INV-06 | Document → CounterpartyBalance | **MEDIUM** | `onDocumentConfirmedBalance` outbox handler + direct call in `cancelDocumentTransactional()` |
| INV-07 | Document → Finance Journal | **MEDIUM** | `onDocumentConfirmedJournal` outbox handler |
| INV-08 | Payment → Document confirm | **MEDIUM** | `confirmEcommerceOrderPayment()` with idempotency guard — accepted limitation per roadmap |
| INV-11 | EventBus vs Outbox | **STRONG** | `bootstrapDomainEvents()` is no-op; `eventBus.publish()` has zero call sites; all handlers registered via outbox — P2-06 complete |
| INV-12 | Party merge links | **MEDIUM** | `resolveFinalParty()` traversal works; PartyLink update on merge scheduled for P3-08 |

**Key Improvements from Phase 2:**
- INV-02: Upgraded from MISSING to MEDIUM (P2-04, P2-05)
- INV-04: Upgraded from MISSING to MEDIUM-STRONG (P2-01, P2-02, P2-03)
- INV-11: Upgraded from WEAK to STRONG (P2-06)

---

## 6. Architecture Consistency Check

### 6.1 Document vs Code Alignment

| Document | Check | Status |
|----------|-------|--------|
| `erp-normalization-roadmap.md` | P2-01 through P2-08 marked ✅ Complete | ✅ Aligned |
| `erp-architecture-map.md` | Events/Outbox section shows SLA table with 60s cron, 120s max delay | ✅ Aligned |
| `erp-architecture-map.md` | Event Flow Map shows DEAD transition | ✅ Aligned |
| `erp-architecture-guardrails.md` | Section 6 "Retry and Dead-Letter Handling" matches code | ✅ Aligned |
| `erp-architecture-guardrails.md` | Section 6 "Outbox SLA (P2-08)" matches code | ✅ Aligned |
| `p2-deploy-runbook.md` | Deployment scope table matches actual files | ✅ Aligned |

### 6.2 Schema Migration Verification

| Migration | File | Status |
|-----------|------|--------|
| `20260314_add_outbox_dead_status` | `prisma/migrations/20260314_add_outbox_dead_status/migration.sql` | ✅ Present and applied |

```sql
-- Migration content verified:
ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';
```

### 6.3 Prisma Schema Verification

```prisma
// schema.prisma lines 1129-1134
enum OutboxStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED    // Deprecated: use DEAD for terminal state. Kept for backward compatibility.
  DEAD      // Terminal: max retries exhausted. Requires manual intervention or backfill.
}
```

✅ **CONFIRMED:** Schema matches code expectations.

---

## 7. Phase 2 Completion Verification

| Task | Status | Verification Evidence |
|------|--------|----------------------|
| P2-01 | ✅ Complete | `app/api/accounting/products/[id]/route.ts` lines 84-89: `product.updated` outbox event inside transaction |
| P2-02 | ✅ Complete | `app/api/accounting/products/[id]/route.ts` lines 111-116: `sale_price.updated` outbox event inside transaction |
| P2-03 | ✅ Complete | `app/api/accounting/products/[id]/discounts/route.ts` lines 93-98, 130-135: `discount.updated` outbox event inside transaction |
| P2-04 | ✅ Complete | `app/api/auth/customer/telegram/route.ts` lines 103-114: `resolveParty()` called for new customers with graceful degradation |
| P2-05 | ✅ Complete | `app/api/ecommerce/orders/quick-order/route.ts` lines 94-105: `resolveParty()` called for new guest customers with graceful degradation |
| P2-06 | ✅ Complete | `lib/bootstrap/domain-events.ts`: no-op function, no IEventBus wiring |
| P2-07 | ✅ Complete | `lib/events/outbox.ts`: DEAD status, `markOutboxFailed()` logic, `getOutboxStats()` exposes `dead` |
| P2-08 | ✅ Complete | SLA documented in `erp-architecture-map.md` and `erp-architecture-guardrails.md` |

**No remaining gaps identified.**

---

## 8. Event Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION EVENT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

MUTATION ROUTES (Atomic Write + Outbox Emission)
│
├─ PUT /api/accounting/products/[id] ───────────────────────────────────────┐
│  ├─ P2-01: tx.product.update() + createOutboxEvent(tx, "product.updated") │
│  └─ P2-02: tx.salePrice.create() + createOutboxEvent(tx, "sale_price.updated")
│
├─ POST/DELETE /api/accounting/products/[id]/discounts ─────────────────────┤
│  └─ P2-03: tx.productDiscount.*() + createOutboxEvent(tx, "discount.updated")
│
└─ confirmDocumentTransactional() ──────────────────────────────────────────┤
   └─ tx.document.update() + createOutboxEvent(tx, "DocumentConfirmed")

                              ↓ (atomic transaction)
                    ┌─────────────────────┐
                    │   OutboxEvent Table │
                    │   status: "PENDING" │
                    └─────────────────────┘
                              ↓
CRON (every 60s)
│
└─ POST /api/system/outbox/process ───────────────────────────────────────────┐
   └─ processOutboxEvents()
        ├─ claimOutboxEvents() → status="PROCESSING" (atomic claim)
        └─ For each event:
             ├─ Execute registered handlers
             ├─ SUCCESS → markOutboxProcessed() → status="PROCESSED"
             └─ FAILURE → markOutboxFailed()
                  ├─ attempts < 5 → status="PENDING" + backoff
                  └─ attempts >= 5 → status="DEAD" + logger.error()

HANDLER REGISTRY (Both in route.ts and process-outbox.ts)
│
├─ registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedBalance)
├─ registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedJournal)
├─ registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedPayment)
├─ registerOutboxHandler("product.updated", onProductCatalogUpdated)
├─ registerOutboxHandler("sale_price.updated", onProductCatalogUpdated)
└─ registerOutboxHandler("discount.updated", onProductCatalogUpdated)

HANDLER EFFECTS
│
├─ onDocumentConfirmedBalance ───────→ recalculateBalance(counterpartyId)
├─ onDocumentConfirmedJournal ───────→ autoPostDocument(documentId)
├─ onDocumentConfirmedPayment ───────→ db.payment.create()
└─ onProductCatalogUpdated ──────────→ updateProductCatalogProjection(productId)
                                          ├─ buildProductCatalogProjection()
                                          └─ db.productCatalogProjection.upsert()
```

---

## 9. Projection Flow Confirmation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCT CATALOG PROJECTION FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

ADMIN UI MUTATION
│
├─ Edit Product ──────────────────────────────┐
│  └─ PUT /api/accounting/products/[id]       │
│       └─ db.$transaction()                  │
│            ├─ tx.product.update()           │
│            └─ createOutboxEvent(tx, {       │
│                 type: "product.updated",    │
│                 payload: { productId }      │
│               })                            │
│                                             │
├─ Update Sale Price ─────────────────────────┤
│  └─ PUT /api/accounting/products/[id]       │
│       └─ db.$transaction()                  │
│            ├─ tx.salePrice.update/create()  │
│            └─ createOutboxEvent(tx, {       │
│                 type: "sale_price.updated", │
│                 payload: { productId }      │
│               })                            │
│                                             │
└─ Create/Delete Discount ────────────────────┤
   └─ POST/DELETE /api/accounting/products/[id]/discounts
        └─ db.$transaction()
             ├─ tx.productDiscount.create/update()
             └─ createOutboxEvent(tx, {
                  type: "discount.updated",
                  payload: { productId }
                })

                              ↓
                    ┌─────────────────────┐
                    │   OutboxEvent Table │
                    │   status: "PENDING" │
                    └─────────────────────┘
                              ↓
CRON (every 60s, SLA: 120s max delay)
│
└─ POST /api/system/outbox/process
     └─ processOutboxEvents()
          └─ Handler: onProductCatalogUpdated(event)
               └─ updateProductCatalogProjection(productId)
                    ├─ buildProductCatalogProjection(productId) [PURE]
                    │    ├─ Read Product, SalePrice, ProductDiscount, Review
                    │    ├─ Compute projection state
                    │    └─ Return { action: "upsert" | "delete" | "skip", data? }
                    │
                    └─ Orchestrator
                         └─ db.productCatalogProjection.upsert() or .delete()

                              ↓
                    ┌─────────────────────────────┐
                    │  ProductCatalogProjection   │
                    │  (storefront read model)    │
                    └─────────────────────────────┘
                              ↓
STOREFRONT API
   └─ GET /api/ecommerce/catalog/*
        └─ Read from ProductCatalogProjection
```

---

## 10. Final Verdict

### Phase 2 Status: ✅ READY

All Phase 2 tasks have been successfully implemented, deployed, and verified:

| Criterion | Result |
|-----------|--------|
| All P2 tasks implemented | ✅ PASS |
| All outbox events emitted in transactions | ✅ PASS |
| All handlers registered in both cron and CLI | ✅ PASS |
| Party mirror creation active | ✅ PASS |
| IEventBus removed from production boot | ✅ PASS |
| DEAD status operational | ✅ PASS |
| Documentation synchronized | ✅ PASS |
| No production code regressions | ✅ PASS |

### Operational Readiness

The system is ready for production operation with the following monitoring in place:

1. **Outbox Health Endpoint:** `GET /api/system/outbox/process` returns `{ stats: { pending, processing, processed, failed, dead, oldestPendingAt } }`
2. **Dead Letter Alerting:** Any `dead > 0` requires immediate investigation
3. **SLA Monitoring:** `pending` events older than 2 minutes indicate cron issues
4. **Projection Verification:** `scripts/verify-product-catalog-projection.ts` available for consistency checks

### Next Phase Readiness

Phase 3 (Module Normalization) may proceed. Prerequisites:
- P2 operational stability confirmed (monitor for 24-48 hours)
- No dead events accumulating
- Projection updates flowing correctly

---

*Report generated: 2026-03-14*  
*Verification performed against commit: ce8327b*

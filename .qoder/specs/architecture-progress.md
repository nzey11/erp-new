# Architecture Improvements: Implementation Progress

**Spec Version:** 1.1  
**Spec File:** [architecture-improvements.md](./architecture-improvements.md)  
**Last Updated:** 2026-03-12

---

## Overview

This file tracks the implementation progress of architecture improvements. Each phase has specific tasks with checkboxes.

**Core Anchor:** Stock Movements + refactor confirm() — this is the foundation for everything else.

---

## Phase 0: Critical Production Fixes

**Status:** 🟢 Completed  
**Priority:** Immediate  
**Duration:** 1 week  
**Risk Level:** Low

### 0.1 Migrations Instead of db push

- [x] Update `.github/workflows/ci.yml` — replace `db push` with `migrate deploy`
- [ ] Create initial migration from current schema (requires manual execution)
- [ ] Test migration on staging database (requires manual execution)
- [ ] Document migration process in project wiki

**Files modified:**
- `.github/workflows/ci.yml` (line 135)

### 0.2 Structured Logging

- [x] Replace `console.error` with `logger` in all API routes
- [x] Add requestId to all API responses (X-Request-Id header in middleware)
- [ ] Test error logging with stack traces

**Files updated:**
- [x] `app/api/accounting/upload/route.ts`
- [x] `app/api/auth/customer/telegram/route.ts`
- [x] `app/api/ecommerce/categories/route.ts`
- [x] `app/api/ecommerce/checkout/route.ts`
- [x] `app/api/ecommerce/cms-pages/[slug]/route.ts`
- [x] `app/api/ecommerce/cms-pages/route.ts`
- [x] `app/api/ecommerce/orders/quick-order/route.ts`
- [x] `app/api/ecommerce/products/[slug]/related/route.ts`
- [x] `app/api/ecommerce/products/[slug]/route.ts`
- [x] `app/api/ecommerce/products/route.ts`
- [x] `app/api/ecommerce/promo-blocks/route.ts`
- [x] `app/api/integrations/telegram/route.ts`
- [x] `lib/shared/authorization.ts`
- [x] `middleware.ts` (X-Request-Id)

### 0.3 Webhook Idempotency

- [x] Add `ProcessedWebhook` model to `prisma/schema.prisma`
- [x] Create `lib/shared/webhook-idempotency.ts`
- [ ] Create migration (requires manual execution)
- [ ] Update webhook handlers to use idempotency check
- [ ] Add tests for idempotency

**New files created:**
- `lib/shared/webhook-idempotency.ts`

### 0.4 CSRF Protection

- [x] Create `lib/shared/csrf.ts` with token generation/validation
- [x] Create `/api/auth/csrf` endpoint
- [x] Update middleware for CSRF validation on mutating requests
- [x] Create client-side CSRF helper `lib/client/csrf.ts`
- [ ] Add tests for CSRF protection

**New files created:**
- `lib/shared/csrf.ts`
- `lib/client/csrf.ts`
- `app/api/auth/csrf/route.ts`

**Files modified:**
- `middleware.ts` (CSRF validation)

### 0.5 Rate Limiter Documentation

- [x] Add warning comment to `lib/shared/rate-limit.ts`
- [x] Document Redis requirement for production

**Files modified:**
- `lib/shared/rate-limit.ts` (comprehensive warning comment)

---

## Phase 1: Architecture Cleanup

**Status:** 🔴 Not Started  
**Priority:** High  
**Duration:** 4-6 weeks  
**Risk Level:** Medium

### 1.1 Stock Movements as Source of Truth

- [ ] Add `StockMovement` model to `prisma/schema.prisma`
- [ ] Create migration
- [ ] Create `lib/modules/inventory/stock-movement.service.ts`
- [ ] Implement `createMovementsForDocument()`
- [ ] Implement `recalculateProjection()`
- [ ] Update confirm flow to use stock movements
- [ ] Update cancel flow to create reversing movements
- [ ] Add tests for stock calculations
- [ ] Verify historical data can be reconstructed

**New files:**
- `lib/modules/inventory/stock-movement.service.ts`

### 1.2 Simplify confirm() Operation

- [ ] Create `lib/modules/accounting/services/document-confirm.service.ts`
- [ ] Implement `confirm()` — transactional core
- [ ] Implement `postConfirmEffects()` — async reactions
- [ ] Update `app/api/accounting/documents/[id]/confirm/route.ts`
- [ ] Add error handling for non-critical effects
- [ ] Add tests for both paths
- [ ] Monitor for failed post-effects

**New files:**
- `lib/modules/accounting/services/document-confirm.service.ts`

### 1.3 State Machines for Documents and Orders

- [ ] Create `lib/modules/accounting/document-states.ts`
- [ ] Define state transitions for all document types
- [ ] Implement `canTransition()` function
- [ ] Implement `validateTransition()` function
- [ ] Implement `getAvailableTransitions()` function
- [ ] Update confirm/cancel/ship endpoints to use state machine
- [ ] Add API endpoint for available transitions (for UI)
- [ ] Add tests for all transition combinations

**New files:**
- `lib/modules/accounting/document-states.ts`

### 1.4 Logical Domain Separation

- [ ] Create `lib/modules/catalog/` structure
- [ ] Create `lib/modules/inventory/` structure
- [ ] Create `lib/modules/sales/` structure
- [ ] Create `lib/modules/procurement/` structure
- [ ] Create `lib/modules/finance/` structure (refactor existing)
- [ ] Create `lib/modules/ledger/` structure
- [ ] Create `lib/modules/identity/` structure
- [ ] Move catalog-related code
- [ ] Move inventory-related code
- [ ] Move sales-related code
- [ ] Move ledger-related code
- [ ] Update all imports
- [ ] Add backward-compatible barrel exports in `accounting/index.ts`
- [ ] Run all tests
- [ ] Update ESLint module boundaries

### 1.5 In-Process Domain Events

- [ ] Create `lib/shared/events/event-types.ts`
- [ ] Create `lib/shared/events/event-bus.ts`
- [ ] Implement `subscribe()` function
- [ ] Implement `publish()` function
- [ ] Create handlers for `document.confirmed`
- [ ] Create handlers for `document.cancelled`
- [ ] Create handlers for `stock.movement`
- [ ] Update confirm/cancel to publish events
- [ ] Add tests for event flow

**New files:**
- `lib/shared/events/event-types.ts`
- `lib/shared/events/event-bus.ts`
- `lib/shared/events/index.ts`

---

## Phase 2: Scalability Preparation

**Status:** 🔴 Not Started  
**Priority:** Medium  
**Duration:** 4-6 weeks  
**Risk Level:** Medium-High

### 2.1 Durable Event Delivery via Outbox

- [ ] Add `OutboxEvent` model to `prisma/schema.prisma`
- [ ] Create migration
- [ ] Create `lib/shared/events/outbox.ts`
- [ ] Implement `createOutboxEvent()`
- [ ] Implement `processOutboxEvents()`
- [ ] Update confirm flow to use outbox
- [ ] Create cron endpoint `app/api/cron/process-outbox/route.ts`
- [ ] Add monitoring for failed events
- [ ] Add tests for outbox processing

**New files:**
- `lib/shared/events/outbox.ts`
- `app/api/cron/process-outbox/route.ts`

### 2.2 Tenant-Ready Architecture Seams

**Note:** Preparation only, NOT full implementation.

- [ ] Design tenant-aware auth model (document)
- [ ] Add `Tenant` model to `prisma/schema.prisma` (placeholder, no relations)
- [ ] Create migration
- [ ] Document scoping strategy
- [ ] Plan permission model changes
- [ ] Create migration plan for adding tenant_id later

**Deferred to Phase 3+:**
- Adding tenant_id to all entities
- Prisma extension for auto-filtering
- Row-level security
- Tenant-specific settings

### 2.3 Read Projections for Storefront

- [ ] Add `ProductCatalogProjection` model to `prisma/schema.prisma`
- [ ] Create migration
- [ ] Create `lib/modules/catalog/projections/product-catalog.projection.ts`
- [ ] Implement `updateProductCatalogProjection()`
- [ ] Create event handlers for projection updates
- [ ] Update storefront API to use projections
- [ ] Add cron job to rebuild projections (safety net)
- [ ] Add tests for projection consistency

**New files:**
- `lib/modules/catalog/projections/product-catalog.projection.ts`

### 2.4 Redis Rate Limiter

- [ ] Create Upstash account and get credentials
- [ ] Add environment variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- [ ] Create `lib/shared/rate-limit-redis.ts`
- [ ] Implement `authLimiter`, `apiLimiter`, `checkoutLimiter`
- [ ] Update middleware to use new limiter
- [ ] Remove in-memory implementation (or keep as fallback)
- [ ] Add tests for rate limiting

**New files:**
- `lib/shared/rate-limit-redis.ts`

---

## Phase 3: Maturity

**Status:** 🔴 Not Started  
**Priority:** Lower  
**Duration:** Ongoing  
**Risk Level:** Low

### 3.1 Scenario Tests

- [ ] Create `tests/scenarios/order-flow.test.ts`
- [ ] Test complete order flow (cart → checkout → payment → shipment → delivery)
- [ ] Test document lifecycle (draft → confirmed → shipped → delivered)
- [ ] Test stock movements and projections
- [ ] Test ledger posting and balancing
- [ ] Test payment reconciliation

### 3.2 Invariant Tests

- [ ] Test: Stock never goes negative without override
- [ ] Test: Document can't be confirmed twice
- [ ] Test: Journal entries are always balanced
- [ ] Test: Payments are never double-applied
- [ ] Test: Cancel reverses all effects correctly

### 3.3 Performance Monitoring

- [ ] Add query logging with duration
- [ ] Add slow query alerts
- [ ] Add API response time tracking
- [ ] Add error rate monitoring

### 3.4 Audit Logging

- [ ] Add `AuditLog` model to `prisma/schema.prisma`
- [ ] Create migration
- [ ] Create `lib/shared/audit.ts`
- [ ] Integrate with document operations
- [ ] Integrate with auth operations
- [ ] Add query endpoints for audit logs

---

## Progress Summary

| Phase | Status | Completion | Started | Completed |
|-------|--------|------------|---------|-----------|
| P0 | 🟢 Completed | 85% | 2026-03-12 | 2026-03-12 |
| P1 | 🔴 Not Started | 0% | - | - |
| P2 | 🔴 Not Started | 0% | - | - |
| P3 | 🔴 Not Started | 0% | - | - |

**Legend:**
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⚠️ Blocked

**P0 Remaining (Manual):**
- Create Prisma migration
- Test on staging
- Add tests for CSRF and idempotency

---

## Notes

### Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | Defer full multi-tenant to Phase 3+ | Expensive migration, wait for product-market fit |
| 2026-03-12 | In-process events before outbox | Simpler to implement, can upgrade later |
| 2026-03-12 | State machines as separate phase | Critical for document lifecycle clarity |

### Blockers

| Phase | Blocker | Status | Resolution |
|-------|---------|--------|------------|
| P2.4 | Upstash account needed | Pending | Create account before starting |

---

## Quick Links

- [Architecture Improvements Spec](./architecture-improvements.md)
- [Prisma Schema](../../prisma/schema.prisma)
- [CI Workflow](../../.github/workflows/ci.yml)
- [Test Directory](../../tests/)

---

*Last updated: 2026-03-12*

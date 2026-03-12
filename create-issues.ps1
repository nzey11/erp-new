$repo = "nzey11/erp-new"

# === 1. Create labels ===
$labels = @(
    @{ name="P0"; color="d73a4a"; desc="Critical - immediate" },
    @{ name="P1"; color="e4e669"; desc="High priority - architecture" },
    @{ name="P2"; color="0075ca"; desc="Medium - scalability" },
    @{ name="P3"; color="cfd3d7"; desc="Low - maturity" },
    @{ name="critical"; color="b60205"; desc="Critical issue" },
    @{ name="security"; color="e11d48"; desc="Security related" },
    @{ name="architecture"; color="7057ff"; desc="Architecture" },
    @{ name="refactoring"; color="84b6eb"; desc="Refactoring" },
    @{ name="ecommerce"; color="f9a825"; desc="E-commerce module" },
    @{ name="scalability"; color="006b75"; desc="Scalability" },
    @{ name="infrastructure"; color="0052cc"; desc="Infrastructure" },
    @{ name="testing"; color="e4e669"; desc="Testing" },
    @{ name="monitoring"; color="c5def5"; desc="Monitoring" }
)

Write-Host "Creating labels..."
foreach ($l in $labels) {
    gh label create $l.name --repo $repo --color $l.color --description $l.desc --force
}

# === 2. Write body files ===
$tmp = "$env:TEMP\gh-issues"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# Phase 0
Set-Content "$tmp\p0.md" @"
## Priority: Immediate | Duration: 1 week | Risk: Low

### 0.1 Migrations Instead of db push
**Problem:** ``prisma db push --accept-data-loss`` destroys data in CI.
- [ ] Create initial migration from current schema
- [ ] Test migration on staging database
- [ ] Update ``.github/workflows/ci.yml`` — replace ``db push`` with ``migrate deploy``

### 0.2 Structured Logging
**Problem:** ``console.error()`` used in 15+ API routes.
- [ ] Replace console.* in all API routes with structured logger
- [ ] Add X-Request-Id header to all responses
- [ ] Test error logging with stack traces

### 0.3 Webhook Idempotency
**Problem:** Payment webhooks can be received multiple times.
- [ ] Add ``ProcessedWebhook`` model to prisma schema
- [ ] Create migration
- [ ] Update webhook handlers
- [ ] Add tests for idempotency

### 0.4 CSRF Protection
**Problem:** Cookie-based auth without CSRF is vulnerable.
- [ ] Create ``lib/shared/csrf.ts``
- [ ] Create ``/api/auth/csrf`` endpoint
- [ ] Update middleware for CSRF validation
- [ ] Create client-side CSRF helper
- [ ] Add tests

### 0.5 Rate Limiter Documentation
- [ ] Add warning comment to ``lib/shared/rate-limit.ts``
- [ ] Document Redis requirement for production

**Spec:** ``.qoder/specs/architecture-improvements.md``
"@

# Phase 1
Set-Content "$tmp\p1.md" @"
## Priority: High | Duration: 4-6 weeks | Risk: Medium

**Core Anchor:** Stock Movements + refactor confirm() — foundation for everything else.

### 1.1 Stock Movements as Source of Truth
**Problem:** ``StockRecord`` is a magical aggregate without audit trail.
**Solution:** ``StockMovement`` as immutable log, ``StockRecord`` as projection.
- [ ] Add StockMovement model
- [ ] Create migration
- [ ] Implement StockMovementService
- [ ] Update confirm/cancel flows
- [ ] Add tests for stock calculations

### 1.2 Simplify confirm() Operation
**Problem:** confirm() does too many things synchronously.
**Solution:** Split into transactional core + async reactions.
- [ ] Create DocumentConfirmService
- [ ] Implement confirm() — transactional core
- [ ] Implement postConfirmEffects() — async reactions
- [ ] Add error handling for non-critical effects
- [ ] Add tests for both paths

### 1.3 State Machines for Documents and Orders
**Problem:** Document lifecycle is implicit and scattered across code.
- [ ] Create ``lib/modules/accounting/document-states.ts``
- [ ] Define state transitions for all document types
- [ ] Implement canTransition/validateTransition/getAvailableTransitions
- [ ] Update confirm/cancel/ship endpoints
- [ ] Add API endpoint for available transitions
- [ ] Add tests for all transition combinations

### 1.4 Logical Domain Separation
**Problem:** accounting module is too broad.
**Solution:** Split into catalog, inventory, sales, procurement, finance, ledger, identity.
- [ ] Create new folder structure in ``lib/modules/``
- [ ] Move code to appropriate domains
- [ ] Update all imports
- [ ] Add backward-compatible barrel exports
- [ ] Run all tests

### 1.5 In-Process Domain Events
**Problem:** Direct coupling between modules.
- [ ] Create ``lib/shared/events/event-types.ts``
- [ ] Create ``lib/shared/events/event-bus.ts``
- [ ] Create handlers for document.confirmed/cancelled/stock.movement
- [ ] Update confirm/cancel to publish events
- [ ] Add tests for event flow

**Spec:** ``.qoder/specs/architecture-improvements.md``
"@

# Phase 2
Set-Content "$tmp\p2.md" @"
## Priority: Medium | Duration: 4-6 weeks | Risk: Medium-High

### 2.1 Durable Event Delivery via Outbox
**Problem:** In-process events are lost on failure.
- [ ] Add OutboxEvent model
- [ ] Create migration
- [ ] Implement createOutboxEvent() and processOutboxEvents()
- [ ] Update confirm flow to use outbox
- [ ] Create cron endpoint ``app/api/cron/process-outbox/route.ts``
- [ ] Add monitoring for failed events
- [ ] Add tests

### 2.2 Tenant-Ready Architecture Seams
**Note:** Preparation only, NOT full implementation.
- [ ] Design tenant-aware auth model (document)
- [ ] Add Tenant model as placeholder
- [ ] Document scoping strategy
- [ ] Plan permission model changes

### 2.3 Read Projections for Storefront
- [ ] Add ProductCatalogProjection model
- [ ] Implement updateProductCatalogProjection()
- [ ] Create event handlers for projection updates
- [ ] Update storefront API to use projections
- [ ] Add cron job to rebuild projections

### 2.4 Redis Rate Limiter
- [ ] Create Upstash account + get credentials
- [ ] Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
- [ ] Create ``lib/shared/rate-limit-redis.ts``
- [ ] Update middleware
- [ ] Add tests

**Spec:** ``.qoder/specs/architecture-improvements.md``
"@

# Phase 3
Set-Content "$tmp\p3.md" @"
## Priority: Lower | Duration: Ongoing | Risk: Low

### 3.1 Scenario Tests
- [ ] Test complete order flow (cart to checkout to payment to shipment to delivery)
- [ ] Test document lifecycle (draft to confirmed to shipped to delivered)
- [ ] Test stock movements and projections
- [ ] Test ledger posting and balancing
- [ ] Test payment reconciliation

### 3.2 Invariant Tests
- [ ] Stock never goes negative without override
- [ ] Document cannot be confirmed twice
- [ ] Journal entries are always balanced
- [ ] Payments are never double-applied
- [ ] Cancel reverses all effects correctly

### 3.3 Performance Monitoring
- [ ] Add query logging with duration
- [ ] Add slow query alerts
- [ ] Add API response time tracking
- [ ] Add error rate monitoring

### 3.4 Audit Logging
- [ ] Add AuditLog model
- [ ] Create migration
- [ ] Create ``lib/shared/audit.ts``
- [ ] Integrate with document operations
- [ ] Integrate with auth operations
- [ ] Add query endpoints for audit logs

**Spec:** ``.qoder/specs/architecture-improvements.md``
"@

# E-commerce
Set-Content "$tmp\ecom.md" @"
## Goal
Move customer orders from e-commerce to ERP. E-commerce becomes storefront/CMS only.

## Problem
- Orders duplicated between e-commerce and ERP
- Statuses not synchronized
- Customer != Counterparty

## Migration Phases

### Phase 1: Schema Changes (2h)
- [ ] Add fields to Document: customerId, deliveryType, deliveryAddressId, paymentMethod, paymentStatus, paidAt, shippedAt, deliveredAt
- [ ] Add relations to Customer, CustomerAddress, Counterparty
- [ ] Create migration

### Phase 2: Logic Implementation (3h)
- [ ] Rewrite checkout to create Document(sales_order) instead of Order
- [ ] Implement getOrCreateCounterparty() from Customer
- [ ] Add payment confirmation logic

### Phase 3: Data Migration (2h)
- [ ] Migrate existing Orders to Documents (SQL migration script)
- [ ] Migrate OrderItems to DocumentItems
- [ ] Map statuses: pending->draft, paid->confirmed, shipped->confirmed+shippedAt, etc.

### Phase 4: Cleanup (4h)
- [ ] Update all code references
- [ ] Remove Order, OrderItem, OrderCounter models from schema
- [ ] Create migration
- [ ] Update UI (store account orders page)

### Phase 5: Testing (3h)
- [ ] Update integration tests
- [ ] Test full checkout flow
- [ ] Test order history for customers

**Total estimated: 14 hours**

**Spec:** ``.qoder/specs/ecommerce-orders-refactoring.md``
"@

# === 3. Create issues ===
Write-Host "Creating issues..."

gh issue create --repo $repo --title "Phase 0: Critical Production Fixes" --body-file "$tmp\p0.md" --label "P0,critical,security"
gh issue create --repo $repo --title "Phase 1: Architecture Cleanup" --body-file "$tmp\p1.md" --label "P1,architecture,refactoring"
gh issue create --repo $repo --title "Phase 2: Scalability Preparation" --body-file "$tmp\p2.md" --label "P2,scalability,infrastructure"
gh issue create --repo $repo --title "Phase 3: Maturity" --body-file "$tmp\p3.md" --label "P3,testing,monitoring"
gh issue create --repo $repo --title "E-commerce Orders Refactoring" --body-file "$tmp\ecom.md" --label "P1,refactoring,ecommerce,architecture"

Write-Host "Done!"

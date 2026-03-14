# Post-Deploy Checklist — Phase 3 & Phase 4

> **Release:** P3-P4 Combined Deployment  
> **Status:** Post-Deploy Verification  
> **Date:** 2026-03-14  
> **Companion:** `.qoder/specs/release-readiness-p3-p4.md`

---

## 1. Application Health

### 1.1 Application Boots Successfully

```bash
# Check application logs
docker-compose logs -f app  # or platform-specific

# Expected: No Prisma connection errors
# Expected: No migration errors
# Expected: "Ready" or "Listening" message
```

**Sign-off:** [ ] Application started without crash

### 1.2 No Migration Errors

```bash
# Verify migration status
npx prisma migrate status

# Expected output:
# Database schema is up to date
```

**Sign-off:** [ ] Migrations applied successfully

### 1.3 No Prisma Startup Errors

```bash
# Verify Prisma client
curl -f http://localhost:3000/api/health 2>/dev/null || echo "Health endpoint check"

# Or check logs for:
# - "PrismaClientInitializationError" (bad)
# - "PrismaClientKnownRequestError" with migration issues (bad)
```

**Sign-off:** [ ] Prisma client connected successfully

---

## 2. Counterparty Tenant Verification

### 2.1 Confirm Counterparty.tenantId Exists

```bash
# Check column exists
psql $DATABASE_URL -c '
  SELECT column_name, is_nullable, data_type 
  FROM information_schema.columns 
  WHERE table_name = '"'"'Counterparty'"'"' 
    AND column_name = '"'"'tenantId'"'"';
'

# Expected:
#  column_name | is_nullable | data_type
# -------------+-------------+-----------
#  tenantId    | NO          | text
```

**Sign-off:** [ ] Column exists with NOT NULL constraint

### 2.2 Confirm No NULLs

```bash
# Run verification script
npx tsx scripts/verify-counterparty-tenant-gate.ts

# Expected output:
# === Counterparty.tenantId Verification Gate (P4-09) ===
# 
# Gate 1: Checking for NULL tenantId values...
#   ✅ PASS: No counterparties with NULL tenantId
# 
# Gate 2: Checking FK integrity...
#   ✅ PASS: All tenantId values reference valid Tenant rows
# 
# Gate 3: Checking tenantId coverage...
#   ✅ PASS: 100% coverage (X/X counterparties)
# 
# === Summary ===
#   ✅ PASS: No counterparties with NULL tenantId
#   ✅ PASS: All tenantId values reference valid Tenant rows
#   ✅ PASS: 100% coverage (X/X counterparties)
# 
# ✅ All gates passed.
```

**Sign-off:** [ ] All 3 gates pass

### 2.3 Confirm FK Integrity

```bash
# Manual FK check
psql $DATABASE_URL -c '
  SELECT COUNT(*) as invalid_refs
  FROM "Counterparty" c
  LEFT JOIN "Tenant" t ON c."tenantId" = t.id
  WHERE c."tenantId" IS NOT NULL AND t.id IS NULL;
'

# Expected:
#  invalid_refs
# --------------
#             0
```

**Sign-off:** [ ] No orphaned tenantId references

---

## 3. Product / Document / ProductVariant Tenant Verification

### 3.1 Product Tenant Verification

```bash
npx tsx scripts/verify-product-tenant-gate.ts

# Expected: All 3 gates pass
# - NULL tenantId check: PASS
# - Cross-tenant SKU conflict check: PASS
# - TenantId coverage: PASS (100%)
```

**Sign-off:** [ ] Product gates pass

### 3.2 Document Tenant Verification

```bash
npx tsx scripts/verify-document-tenant-gate.ts

# Expected: All 3 gates pass
# - NULL tenantId check: PASS
# - Warehouse tenant consistency: PASS
# - TenantId coverage: PASS (100%)
```

**Sign-off:** [ ] Document gates pass

### 3.3 ProductVariant Tenant Verification

```bash
# Manual verification (no dedicated script)
psql $DATABASE_URL -c '
  SELECT 
    COUNT(*) as total,
    COUNT("tenantId") as with_tenant,
    COUNT(*) - COUNT("tenantId") as null_count
  FROM "ProductVariant";
'

# Expected:
#  total | with_tenant | null_count
# -------+-------------+------------
#    X   |      X      |          0
```

**Sign-off:** [ ] ProductVariant 100% coverage

---

## 4. Outbox Health

### 4.1 Verify /api/system/outbox/health Endpoint

```bash
# Test health endpoint
curl -s -H "Authorization: Bearer $OUTBOX_SECRET" \
  http://localhost:3000/api/system/outbox/health | jq .

# Expected healthy response:
# {
#   "healthy": true,
#   "stats": {
#     "pending": 0,
#     "processing": 0,
#     "processed": X,
#     "failed": 0,
#     "dead": 0
#   }
# }
```

**Sign-off:** [ ] Health endpoint returns healthy status

### 4.2 Expected Healthy Response

| Field | Healthy Value | Action if Unhealthy |
|-------|---------------|---------------------|
| `healthy` | `true` | Investigate if `false` |
| `stats.dead` | `0` | Immediate investigation |
| `stats.failed` | `0` or stable | Check if growing |
| `stats.pending` | `0` or draining | Check if growing stale |

### 4.3 Handling FAILED/DEAD Events > 1 Hour

```bash
# Check for stale events
psql $DATABASE_URL -c '
  SELECT 
    status,
    COUNT(*),
    MIN("createdAt") as oldest
  FROM "OutboxEvent"
  WHERE status IN ('"'"'FAILED'"'"', '"'"'DEAD'"'"')
    AND "createdAt" < NOW() - INTERVAL '"'"'1 hour'"'"'
  GROUP BY status;
'

# If events found:
# 1. Check handler logs for errors
# 2. Inspect event payload: 
#    SELECT * FROM "OutboxEvent" WHERE status = 'DEAD' ORDER BY "createdAt" LIMIT 5;
# 3. Fix underlying issue
# 4. Retry or manually process as appropriate
# 5. Document incident
```

**Sign-off:** [ ] No stale FAILED/DEAD events

---

## 5. CI / Guardrails Verification

### 5.1 CI Passed on Deployed Commit

```bash
# Verify CI status on commit
git log -1 --format="%H"
# Check GitHub Actions / CI platform for commit
```

**Sign-off:** [ ] CI green on deployed commit

### 5.2 Lint / Typecheck / Verify Gates Ran

Verify these steps passed in CI:
- [ ] `Verify Tenant Isolation Gates`
- [ ] `Outbox Health Check`
- [ ] `Lint`
- [ ] `TypeScript type check`
- [ ] `Dead code report`
- [ ] `Unit & Integration Tests`

**Sign-off:** [ ] All CI steps passed

---

## 6. Critical Business Smoke Checks

### 6.1 Create Product

```bash
# Via API (requires auth)
curl -X POST http://localhost:3000/api/accounting/products \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION_COOKIE" \
  -d '{
    "name": "Smoke Test Product",
    "sku": "SMOKE-001",
    "unitId": "<valid-unit-id>"
  }'

# Expected: 201 Created with product object
# Verify: product.tenantId matches session tenant
```

**Sign-off:** [ ] Product creation works

### 6.2 Create Counterparty

```bash
# Via API (requires auth)
curl -X POST http://localhost:3000/api/accounting/counterparties \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION_COOKIE" \
  -d '{
    "type": "customer",
    "name": "Smoke Test Counterparty",
    "inn": "1234567890"
  }'

# Expected: 201 Created with counterparty object
# Verify: counterparty.tenantId matches session tenant
# Verify: Party mirror created in CRM
```

**Sign-off:** [ ] Counterparty creation works

### 6.3 Create Ecommerce Order / Quick Order

```bash
# Quick order (guest checkout)
curl -X POST http://localhost:3000/api/ecommerce/orders/quick-order \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": "smoke_test_123",
    "name": "Smoke Test Customer",
    "phone": "+79999999999",
    "items": [
      {"productId": "<valid-product-id>", "quantity": 1, "price": 1000}
    ],
    "deliveryType": "pickup"
  }'

# Expected: 200 OK with order details
# Verify: sales_order document created
# Verify: Counterparty created for new customer
```

**Sign-off:** [ ] Ecommerce order creation works

### 6.4 Document Confirm Flow (If Safe)

**WARNING:** Only test in non-production or with test data.

```bash
# Create a draft document
curl -X POST http://localhost:3000/api/accounting/documents \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION_COOKIE" \
  -d '{
    "type": "stock_receipt",
    "warehouseId": "<valid-warehouse-id>",
    "counterpartyId": "<valid-counterparty-id>",
    "items": [
      {"productId": "<valid-product-id>", "quantity": 10, "price": 100}
    ]
  }'

# Confirm the document
curl -X POST http://localhost:3000/api/accounting/documents/<doc-id>/confirm \
  -H "Cookie: session=$SESSION_COOKIE"

# Expected: 200 OK with confirmed document
# Verify: Stock movements created
# Verify: Journal entries created (async)
```

**Sign-off:** [ ] Document confirm flow works (if tested)

### 6.5 Party Merge Invariant Safety

```bash
# Non-destructive check: verify Party merge logic exists
# Check that merge service is present and functional

# List recent parties
psql $DATABASE_URL -c '
  SELECT COUNT(*) as party_count FROM "Party";
'

# Expected: Count increases with Counterparty/Customer creation
```

**Sign-off:** [ ] Party system functional

---

## 7. Sign-Off Section

### Deploy Status

| Check | Status | Notes |
|-------|--------|-------|
| Application boots | ⬜ PASS / ⬜ FAIL | |
| Migrations applied | ⬜ PASS / ⬜ FAIL | |
| Prisma connected | ⬜ PASS / ⬜ FAIL | |

### Migration Status

| Entity | NULL Check | FK Check | Coverage | Status |
|--------|------------|----------|----------|--------|
| Product | ⬜ | ⬜ | ⬜ | ⬜ PASS / ⬜ FAIL |
| Document | ⬜ | ⬜ | ⬜ | ⬜ PASS / ⬜ FAIL |
| ProductVariant | ⬜ | N/A | ⬜ | ⬜ PASS / ⬜ FAIL |
| Counterparty | ⬜ | ⬜ | ⬜ | ⬜ PASS / ⬜ FAIL |

### Smoke Status

| Test | Status | Notes |
|------|--------|-------|
| Create Product | ⬜ PASS / ⬜ FAIL / ⬜ N/A | |
| Create Counterparty | ⬜ PASS / ⬜ FAIL / ⬜ N/A | |
| Create Ecommerce Order | ⬜ PASS / ⬜ FAIL / ⬜ N/A | |
| Document Confirm Flow | ⬜ PASS / ⬜ FAIL / ⬜ SKIP | |
| Party System | ⬜ PASS / ⬜ FAIL / ⬜ N/A | |

### Outbox Status

| Check | Status | Notes |
|-------|--------|-------|
| Health endpoint | ⬜ PASS / ⬜ FAIL | |
| No stale FAILED events | ⬜ PASS / ⬜ FAIL | |
| No stale DEAD events | ⬜ PASS / ⬜ FAIL | |

### Rollback Needed?

⬜ **NO** — All checks passed, deployment successful

⬜ **YES** — Issues detected, rollback required

**Rollback Reason:** _________________________________________________

### Final Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Deploy Engineer | | | |
| QA Verification | | | |
| Product Owner | | | |

---

## Quick Reference Commands

```bash
# Full verification suite
npx tsx scripts/verify-product-tenant-gate.ts
npx tsx scripts/verify-document-tenant-gate.ts
npx tsx scripts/verify-counterparty-tenant-gate.ts

# Outbox health check
npx tsx scripts/check-outbox-health.ts

# Or via HTTP
curl -H "Authorization: Bearer $OUTBOX_SECRET" \
  http://localhost:3000/api/system/outbox/health

# Database tenant check
psql $DATABASE_URL -c '
  SELECT 
    '"'"'Product'"'"' as table, COUNT(*) as total, COUNT("tenantId") as with_tenant FROM "Product"
  UNION ALL
  SELECT 
    '"'"'Document'"'"', COUNT(*), COUNT("tenantId") FROM "Document"
  UNION ALL
  SELECT 
    '"'"'ProductVariant'"'"', COUNT(*), COUNT("tenantId") FROM "ProductVariant"
  UNION ALL
  SELECT 
    '"'"'Counterparty'"'"', COUNT(*), COUNT("tenantId") FROM "Counterparty";
'
```

---

## References

- Release Readiness: `.qoder/specs/release-readiness-p3-p4.md`
- Roadmap: `.qoder/specs/erp-normalization-roadmap.md`
- Bootstrap: `.qoder/specs/p4-execution-bootstrap.md`

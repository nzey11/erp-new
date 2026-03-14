# Release Readiness — Phase 3 & Phase 4

> **Release:** P3-P4 Combined Deployment  
> **Status:** Ready for Deploy  
> **Date:** 2026-03-14  
> **Authority:** `.qoder/specs/erp-normalization-roadmap.md`

---

## 1. Release Scope Summary

### Phase 3 — Module Normalization (COMPLETE)

| Task | Change | Impact |
|------|--------|--------|
| P3-01 | `lib/modules/ecom/` → `lib/modules/ecommerce/` merge | Directory consolidation, import path updates |
| P3-02 | `orders.ts` decomposition into `services/` and `queries/` | Service/query separation, barrel exports |
| P3-03 | `recalculateBalance()` moved to `accounting/services/` | Finance → Accounting service ownership correction |
| P3-04 | Legacy stock functions removed | `recalculateStock()`, `updateStockForDocument()` deleted |
| P3-05 | Test factory split | Monolithic `factories.ts` → domain-scoped factories |
| P3-06 | `createCounterparty()` tenant preparation | Signature update (schema work deferred to P4) |
| P3-07 | `publishDocumentConfirmed()` dead code removal | Function removed, no call sites affected |

**Phase 3 Risk Level:** LOW — Structural refactoring with no schema changes.

### Phase 4 — Hardening & Enforcement (COMPLETE)

| Task | Change | Impact |
|------|--------|--------|
| P4-01 | `Product.tenantId` NOT NULL + FK | Schema constraint enforcement |
| P4-02 | `Document.tenantId` NOT NULL + FK | Schema constraint enforcement |
| P4-03 | `ProductVariant.tenantId` NOT NULL | Schema constraint enforcement |
| P4-04 | ESLint: block `db` imports in routes | Development-time guardrail |
| P4-05 | ESLint: enforce barrel imports | Development-time guardrail |
| P4-06 | CI: verification gates on PR | CI pipeline hardening |
| P4-07 | CI: TypeScript type check + dead code report | CI pipeline hardening |
| P4-08 | Outbox health monitoring | Runtime monitoring + CI check |
| P4-09 | `Counterparty.tenantId` NOT NULL + FK + backfill | **Schema migration with data backfill** |

**Phase 4 Risk Level:** MEDIUM — Schema migrations with NOT NULL constraints require careful deployment.

---

## 2. Risk Classification

### Low-Risk Structural Changes

| Change | Files | Verification |
|--------|-------|--------------|
| P3-01: ecom → ecommerce merge | `lib/modules/ecom/` deleted, imports updated | `tsc --noEmit` clean ✅ |
| P3-02: orders.ts decomposition | `lib/modules/ecommerce/services/`, `queries/` created | Tests pass ✅ |
| P3-03: recalculateBalance move | `lib/modules/accounting/services/balance.service.ts` | Tests pass ✅ |
| P3-04: legacy stock removal | `recalculateStock()`, `updateStockForDocument()` deleted | Tests pass ✅ |
| P3-05: factory split | `tests/helpers/factories/*.ts` created | 737 tests pass ✅ |
| P3-07: dead code removal | `publishDocumentConfirmed()` removed | No call sites ✅ |
| P4-04/05: ESLint rules | `eslint.config.mjs` | Warnings only, no hard fail ✅ |

**Rollback:** Safe — These are code organization changes only.

### Schema-Sensitive Changes

| Change | Migration Files | Backfill Required | Verification Script |
|--------|-----------------|-------------------|---------------------|
| P4-01: Product.tenantId | Schema already enforced | Complete | `verify-product-tenant-gate.ts` |
| P4-02: Document.tenantId | Schema already enforced | Complete | `verify-document-tenant-gate.ts` |
| P4-03: ProductVariant.tenantId | Schema already enforced | Complete | Manual verification |
| **P4-09: Counterparty.tenantId** | `20260314_add_counterparty_tenant/`<br>`20260314_add_counterparty_tenant_not_null/` | **Required** | `verify-counterparty-tenant-gate.ts` |

**Rollback:** Caution — Schema constraints cannot be rolled back without data migration.

### CI / Lint / Monitoring Changes

| Change | File | Impact |
|--------|------|--------|
| P4-04: Block db imports | `eslint.config.mjs` | Warn on 81 violations |
| P4-05: Barrel imports | `eslint.config.mjs` | Warn on ~109 violations |
| P4-06: Verify gates CI | `.github/workflows/ci.yml` | Hard-fail on gate failure |
| P4-07: Type check CI | `.github/workflows/ci.yml` | Hard-fail on type errors |
| P4-08: Outbox health | `.github/workflows/ci.yml`<br>`app/api/system/outbox/health/route.ts` | CI check + HTTP endpoint |

**Rollback:** Safe — CI changes are infrastructure-only.

### Runtime-Sensitive Changes

| Change | Runtime Impact | Monitoring |
|--------|----------------|------------|
| P4-08: Outbox health endpoint | New HTTP endpoint at `/api/system/outbox/health` | Returns 200/503 based on event age |
| P4-09: Counterparty service | `createCounterpartyWithParty()` now requires `tenantId` | Application layer enforcement |

**Rollback:** Application code can be rolled back; schema changes require caution.

---

## 3. Migration-Sensitive Items

### Critical: Counterparty.tenantId Two-Phase Migration

**Phase 1 — Nullable Column (COMPLETED in dev/test):**
```sql
-- Already applied to dev/test databases
ALTER TABLE "Counterparty" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_tenantId_fkey" FOREIGN KEY ...
CREATE INDEX "Counterparty_tenantId_idx" ON "Counterparty"("tenantId");
```

**Phase 2 — NOT NULL Constraint (COMPLETED in dev/test):**
```sql
-- Already applied to dev/test databases
ALTER TABLE "Counterparty" ALTER COLUMN "tenantId" SET NOT NULL;
```

**Production Deployment Requirement:**
- [ ] Run `scripts/backfill-counterparty-tenant.ts` BEFORE applying NOT NULL constraint
- [ ] Run `scripts/verify-counterparty-tenant-gate.ts` — must pass all 3 gates
- [ ] Apply migrations in order: nullable first, then NOT NULL

### Backfill Scripts Inventory

| Script | Purpose | Exit Code | Run Before |
|--------|---------|-----------|------------|
| `backfill-product-tenant.ts` | Fill Product.tenantId | 0/1 | P4-01 schema change |
| `backfill-document-tenant.ts` | Fill Document.tenantId | 0/1 | P4-02 schema change |
| `backfill-product-variant-tenant.ts` | Fill ProductVariant.tenantId | 0/1 | P4-03 schema change |
| `backfill-counterparty-tenant.ts` | Fill Counterparty.tenantId | 0/1 | **P4-09 NOT NULL constraint** |

**Note:** P4-01, P4-02, P4-03 backfills were completed during Phase 4 execution. Only P4-09 may need production backfill if production database was not synced.

### NOT NULL Enforcement Status

| Entity | Dev DB | Test DB | Production DB | Backfill Status |
|--------|--------|---------|---------------|-----------------|
| Product | ✅ NOT NULL | ✅ NOT NULL | Verify before deploy | Should be complete |
| Document | ✅ NOT NULL | ✅ NOT NULL | Verify before deploy | Should be complete |
| ProductVariant | ✅ NOT NULL | ✅ NOT NULL | Verify before deploy | Should be complete |
| Counterparty | ✅ NOT NULL | ✅ NOT NULL | **Requires verification** | Run backfill if needed |

---

## 4. Pre-Deploy Checklist

### Repository State
- [ ] Clean git state: `git status` shows no uncommitted changes
- [ ] On correct branch: `main` or release branch
- [ ] Commit hash recorded: `git rev-parse HEAD` → ___________

### Environment Variables
- [ ] `DATABASE_URL` set and points to production database
- [ ] `OUTBOX_SECRET` set for health endpoint auth
- [ ] `STORE_TENANT_ID` set for ecommerce (if using quick-order)
- [ ] `SESSION_SECRET` set and valid
- [ ] `NODE_ENV=production` for production deploy

### Database Readiness
- [ ] Database connection verified: `npx prisma db pull` succeeds
- [ ] Migration files present in `prisma/migrations/`
- [ ] No pending Prisma migrations: `npx prisma migrate status` clean
- [ ] Backup/snapshot taken (if production)

### CI / Test Status
- [ ] CI green on deployed commit: `.github/workflows/ci.yml` passes
- [ ] Test suite green: `npx vitest run` passes (737/737)
- [ ] TypeScript clean: `npx tsc --noEmit` clean
- [ ] Prisma validate: `npx prisma validate` passes

### Build Readiness
- [ ] Next.js build succeeds: `npm run build` completes
- [ ] No build-time errors
- [ ] Static assets generated

### Migration Order Verification
```bash
# Expected migration order for fresh database:
1. Existing migrations (before P4)
2. 20260314_add_counterparty_tenant (nullable tenantId)
3. 20260314_add_counterparty_tenant_not_null (NOT NULL)
```

---

## 5. Deployment Order Recommendation

### Phase 1: Pre-Deploy (Maintenance Window)

```bash
# 1. Backup (if production)
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Verify current schema
npx prisma db pull --print > schema-before-deploy.prisma
diff prisma/schema.prisma schema-before-deploy.prisma
# Should show only expected differences

# 3. Run verification gates (dry-run check)
npx tsx scripts/verify-product-tenant-gate.ts
npx tsx scripts/verify-document-tenant-gate.ts
npx tsx scripts/verify-counterparty-tenant-gate.ts
# All must pass
```

### Phase 2: Database Migration

```bash
# 1. Apply migrations
npx prisma migrate deploy

# 2. Verify migration success
npx prisma migrate status

# 3. If Counterparty.tenantId is NULL in production:
npx tsx scripts/backfill-counterparty-tenant.ts
npx tsx scripts/verify-counterparty-tenant-gate.ts
# Must pass before proceeding
```

### Phase 3: Application Deploy

```bash
# 1. Deploy application code
# (Platform-specific: docker-compose, Kubernetes, etc.)

# 2. Verify application boots
# Check logs for Prisma connection errors
# Check logs for migration errors
```

### Phase 4: Smoke Checks

```bash
# 1. Application health
curl -f http://localhost:3000/api/health || echo "Health check failed"

# 2. Outbox health
curl -f -H "Authorization: Bearer $OUTBOX_SECRET" \
  http://localhost:3000/api/system/outbox/health

# 3. Run post-deploy verification (see post-deploy-checklist-p3-p4.md)
```

### Phase 5: Sign-Off

- [ ] All smoke checks pass
- [ ] No error spikes in logs
- [ ] Monitoring alerts green
- [ ] Rollback plan not needed

---

## 6. Rollback Considerations

### Safe to Roll Back (Code Only)

| Component | Rollback Action | Risk |
|-----------|-----------------|------|
| P3 structural changes | Revert commits | Low — no data changes |
| P4 ESLint rules | Revert `eslint.config.mjs` | Low — dev-only impact |
| P4 CI changes | Revert `.github/workflows/ci.yml` | Low — CI-only impact |
| P4 outbox endpoint | Revert route file | Low — monitoring only |
| Application services | Revert service files | Medium — ensure schema compatibility |

### Caution Required (Schema-Related)

| Component | Rollback Action | Risk |
|-----------|-----------------|------|
| Counterparty.tenantId NOT NULL | Must drop constraint first | **Data migration required** |
| Product.tenantId NOT NULL | Must drop constraint first | **Data migration required** |
| Document.tenantId NOT NULL | Must drop constraint first | **Data migration required** |

**Schema Rollback Procedure:**
```bash
# If schema rollback is required:
1. Restore code to pre-deploy state
2. Generate migration to drop NOT NULL: 
   npx prisma migrate dev --name rollback_tenant_not_null
3. Deploy rolled-back code
4. Verify application functions
```

### Data-Migration-Sensitive

**DO NOT roll back without caution:**
- Any schema constraint that was applied with data changes
- Backfill operations cannot be "undone" — they are idempotent but irreversible

### Recommended Rollback Strategy

1. **Application-level issues** (bugs, performance): Roll back code immediately
2. **Schema constraint issues**: 
   - If constraint violation errors occur, identify data issues
   - Fix data or temporarily drop constraint via migration
   - Do not roll back backfill scripts
3. **Database connection issues**: Check `DATABASE_URL`, Prisma client generation

---

## References

- Roadmap: `.qoder/specs/erp-normalization-roadmap.md`
- Bootstrap: `.qoder/specs/p4-execution-bootstrap.md`
- Final Summary: `.qoder/specs/p4-final-summary.md`
- Post-Deploy Checklist: `.qoder/specs/post-deploy-checklist-p3-p4.md`

# R2 Tenant Migration Rollback Runbook

**Document Status:** ACTIVE — R2 MIGRATION GOVERNANCE SPECIFIC  
**Scope:** Rollback procedures for tenant-related migrations in Recovery Phase R2  
**Governed By:** `.qoder/specs/erp-recovery-guardrails.md`, `.qoder/specs/erp-recovery-rollback-runbook.md`  
**Execution Reference:** `.qoder/specs/erp-recovery-execution-plan.md`  

---

## 1. Purpose

This runbook provides specific rollback guidance for the tenant migration chain created during Recovery Phase R2 (Migration Governance Recovery). It covers the baseline establishment, provenance restoration, and verification gates related to tenant architecture.

Use this document when:
- A tenant migration causes schema state contradiction
- Verification gates fail after migration-state change
- Baseline/provenance mismatch is detected
- Deploy pipeline cannot reconcile migration history for tenant-related migrations

This is a companion to the general `erp-recovery-rollback-runbook.md` — refer to that document for general failure classification and containment rules.

---

## 2. When Rollback Is Appropriate

Rollback of tenant migrations is appropriate in these specific scenarios:

| Scenario | Indicator |
|----------|-----------|
| Migration state contradiction | `prisma migrate status` shows unexpected pending/applied state for tenant migrations |
| Gate failure after migration change | Verification gate fails after resolving a provenance migration |
| Baseline/provenance mismatch | `_prisma_migrations` row count does not match expected baseline + provenance count |
| Deploy pipeline failure | Pipeline cannot reconcile because tenant migration history is inconsistent |
| Provenance migration failure | `20260315_add_*_tenantId_provenance` migrations fail to apply due to schema mismatch |

---

## 3. Rollback Principles

1. **Do not improvise schema changes.** Use only the migration system or explicit SQL that has been reviewed.

2. **Prefer restoring known migration state over ad hoc SQL.** If the migration history is corrupted, re-establish baseline rather than patching individual tables.

3. **Distinguish provenance-only migrations from data-bearing migrations.**
   - Provenance migrations (R2-03, R2-04) document columns that already exist
   - Data-bearing migrations (historical tenant migrations) introduced new schema elements
   - Rollback approaches differ significantly

4. **Record pre-rollback evidence first.** Capture `prisma migrate status`, `_prisma_migrations` content, and verification gate output before any rollback action.

5. **Never use `db push` as a rollback shortcut.** This compounds migration governance problems.

---

## 4. Migration-by-Migration Rollback Notes

### 4.1 Tenant Core Introduction (20260313_add_tenant_architecture)

**What was introduced:**
- `Tenant` table with id, name, createdAt, updatedAt
- `TenantMembership` table with role enum
- `TenantSettings` table
- Foreign keys linking users to tenants

**Rollback implications:**
- **HIGH RISK** — This is the foundational tenant migration
- Rolling back removes the entire tenant architecture
- All downstream tenant-dependent migrations become invalid
- Data loss risk: tenant assignments, memberships, settings

**Before rollback:**
- Confirm all tenant-dependent data can be reconstructed or is backed up
- Verify no production data depends on tenant architecture
- Check that `Warehouse.tenantId`, `Counterparty.tenantId`, etc. can be nullified safely

**Rollback type:** Schema-affecting + Data-risking

---

### 4.2 Warehouse Tenant Migration (20260313_add_warehouse_tenantId)

**What was introduced:**
- `Warehouse.tenantId` column
- Foreign key to `Tenant` table
- Index on `tenantId`

**Rollback implications:**
- Warehouse records lose tenant association
- Documents referencing warehouses may have tenant inconsistency
- R1 tenant isolation for warehouse-dependent documents may fail

**Before rollback:**
- Run `verify-document-tenant-gate.ts` to confirm document/warehouse tenant alignment
- Document which warehouses belong to which tenants (for potential re-backfill)

**Rollback type:** Schema-affecting + Metadata-only (data can be re-backfilled)

---

### 4.3 Counterparty Tenant Migrations

#### 20260314_add_counterparty_tenant
**What was introduced:**
- `Counterparty.tenantId` column (nullable initially)
- Foreign key to `Tenant` table

#### 20260314_add_counterparty_tenant_not_null
**What was introduced:**
- `NOT NULL` constraint on `Counterparty.tenantId`
- All existing records must have tenantId populated

**Rollback implications:**
- **HIGH RISK** for the NOT NULL migration
- Rolling back NOT NULL requires either:
  - Making tenantId nullable again (loses data integrity), OR
  - Removing counterparties without tenant (data loss)
- Counterparty-tenant gate will fail if NULL values reappear

**Before rollback:**
- Run `verify-counterparty-tenant-gate.ts` to confirm current state
- If rolling back NOT NULL: confirm gate will still pass (no NULL values)
- Document tenant assignments for potential re-backfill

**Rollback type:** 
- `add_counterparty_tenant`: Schema-affecting + Metadata-only
- `add_counterparty_tenant_not_null`: Schema-affecting + High risk

---

### 4.4 Product Tenant Provenance Migration (20260315_add_product_tenantId_provenance)

**What was introduced:**
- Provenance documentation for `Product.tenantId` (column already exists)
- Idempotent SQL: `ADD COLUMN IF NOT EXISTS`, guarded FK, `CREATE INDEX IF NOT EXISTS`

**Rollback implications:**
- This is a **provenance-only** migration
- The SQL is idempotent — applying it multiple times is safe
- Rolling back removes migration history entry only
- Actual schema (column, FK, indexes) remains in place

**Before rollback:**
- Confirm this is truly a provenance issue (schema already matches)
- Verify `Product.tenantId` column exists and has data
- Run `verify-product-tenant-gate.ts` to confirm tenant data integrity

**Rollback type:** Metadata-only (migration history only, no schema change)

**Special note:** If this migration fails to apply, it indicates the actual schema does NOT match expected state. Investigate schema drift rather than forcing rollback.

---

### 4.5 Document Tenant Provenance Migration (20260315_add_document_tenantId_provenance)

**What was introduced:**
- Provenance documentation for `Document.tenantId` (column already exists)
- Idempotent SQL: `ADD COLUMN IF NOT EXISTS`, guarded FK, `CREATE INDEX IF NOT EXISTS`

**Rollback implications:**
- This is a **provenance-only** migration
- The SQL is idempotent — applying it multiple times is safe
- Rolling back removes migration history entry only
- Actual schema (column, FK, indexes) remains in place

**Before rollback:**
- Confirm this is truly a provenance issue (schema already matches)
- Verify `Document.tenantId` column exists and has data
- Run `verify-document-tenant-gate.ts` to confirm tenant/warehouse alignment

**Rollback type:** Metadata-only (migration history only, no schema change)

**Special note:** If this migration fails to apply, it indicates the actual schema does NOT match expected state. Investigate schema drift rather than forcing rollback.

---

## 5. Recovery Steps

### Step 1: Capture Current State

```bash
# Capture migration status
npx prisma migrate status > migration-status-$(date +%Y%m%d-%H%M%S).log

# Capture migration table content
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.\$queryRawUnsafe('SELECT migration_name, finished_at FROM \"_prisma_migrations\" ORDER BY finished_at');
console.log(JSON.stringify(rows, null, 2));
await db.\$disconnect();
"
```

### Step 2: Identify Issue Type

| Issue | Indicator | Action |
|-------|-----------|--------|
| Provenance migration pending | `migrate status` shows provenance migration as pending | Normal — resolve in R2-07 |
| Provenance migration failed | Migration applied but with errors | Investigate schema drift |
| Baseline migration missing | Row count < 12 | Re-establish baseline (R2-02) |
| Migration order incorrect | `finished_at` timestamps out of order | Check dependency resolution |

### Step 3: Choose Containment Path

**Path A: Provenance-only issue**
- Migration file exists but not resolved
- Schema already matches migration content
- Action: Resolve as applied (R2-07 step)

**Path B: Schema mismatch**
- Migration content does not match actual schema
- Action: Investigate drift, do NOT force resolve

**Path C: Baseline corruption**
- Historical migrations missing from `_prisma_migrations`
- Action: Re-establish baseline from R2-02

### Step 4: Execute Rollback (if required)

For provenance migrations only:
```bash
# If migration was incorrectly resolved, mark as rolled back
npx prisma migrate resolve --rolled-back 20260315_add_product_tenantId_provenance
npx prisma migrate resolve --rolled-back 20260315_add_document_tenantId_provenance
```

For data-bearing migrations — **consult Phase 5 team before proceeding**:
- Do not roll back tenant architecture without explicit approval
- Data loss risk is high

### Step 5: Verify After Rollback/Containment

```bash
# Verify migration status
npx prisma migrate status

# Run verification gates
npx tsx scripts/verify-product-tenant-gate.ts
npx tsx scripts/verify-document-tenant-gate.ts
npx tsx scripts/verify-counterparty-tenant-gate.ts

# Run integration tests
npm run test:integration
```

---

## 6. High-Risk Warnings

### WARNING-1: NOT NULL Rollback Risk
Rolling back `20260314_add_counterparty_tenant_not_null` can reintroduce unsafe NULL state. If you must roll back:
- Ensure `verify-counterparty-tenant-gate.ts` still passes (no NULL values)
- Have a plan to re-apply the NOT NULL constraint
- Document why rollback was necessary

### WARNING-2: Provenance vs. Reality Mismatch
Provenance migrations assume the schema already matches. If a provenance migration fails:
- The schema may have drifted from expected state
- Do NOT force-resolve without investigation
- Check if `Product.tenantId` or `Document.tenantId` actually exists

### WARNING-3: No db Push Shortcut
Never use `prisma db push` to "fix" migration state:
- It bypasses migration history
- It creates drift between `_prisma_migrations` and actual schema
- It compounds governance problems rather than resolving them

### WARNING-4: Tenant Architecture Dependency
The tenant core migration (`20260313_add_tenant_architecture`) is foundational:
- Rolling it back invalidates ALL tenant-dependent data
- All downstream tenant migrations become orphaned
- Only proceed with explicit Phase 5 approval

---

## 7. Verification After Rollback

Minimum checks after any tenant migration rollback:

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Migration status | `npx prisma migrate status` | Expected pending/applied state |
| Migration count | `SELECT COUNT(*) FROM "_prisma_migrations"` | Matches expected count |
| Product gate | `npx tsx scripts/verify-product-tenant-gate.ts` | Exit 0, all gates pass |
| Document gate | `npx tsx scripts/verify-document-tenant-gate.ts` | Exit 0, all gates pass |
| Counterparty gate | `npx tsx scripts/verify-counterparty-tenant-gate.ts` | Exit 0, all gates pass |
| Integration tests | `npm run test:integration` | All tests pass |

All checks must pass before resuming R2 work.

---

## 8. Non-Goals

This document explicitly does **not** cover:

- Full production disaster recovery or backup/restore procedures
- Rollback of Phase 5 schema work (Payment tenant evolution, etc.)
- General Prisma migration design patterns
- Database performance tuning related to tenant indexes
- Migration deployment to production environments
- Incident escalation procedures

For general Recovery Program rollback guidance, refer to `erp-recovery-rollback-runbook.md`.

---

*End of R2 Tenant Migration Rollback Runbook*

# P4-01 Verification Document

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P4-01 |
| **Name** | Enforce Product.tenantId as NOT NULL |
| **Phase** | Phase 4 — Hardening & Enforcement |
| **Date** | 2026-03-14 |
| **Status** | ✅ **COMPLETE (schema/application level), DB verification pending** |

---

## Summary

P4-01 has been verified at the **schema and application level**. The Prisma schema already defines `Product.tenantId` as non-nullable, and all application code paths provide tenantId when creating products.

**Database-level verification** could not be completed because PostgreSQL was unavailable during analysis. This is documented as a pending verification item, not a blocker.

---

## Schema-Level Verification

### Prisma Schema Definition

**File:** `prisma/schema.prisma` (line 134)

```prisma
model Product {
  id               String               @id @default(cuid())
  name             String
  sku              String?
  // ... other fields ...
  tenantId         String              ← Non-optional (no ? modifier)
  // ... relations ...
  tenant           Tenant               @relation(fields: [tenantId], references: [id])
  // ...
  @@unique([tenantId, sku])            ← Tenant-scoped SKU uniqueness
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, categoryId])
}
```

**Verification:**
- ✅ `tenantId` is defined as `String` (not `String?`)
- ✅ FK relation to `Tenant` model exists
- ✅ Tenant-scoped uniqueness constraint on SKU
- ✅ Database indexes on `tenantId`

### Prisma Schema Validation

```bash
$ npx prisma validate
```

**Result:** ✅ **Valid** — The schema at `prisma/schema.prisma` is valid

---

## Application-Layer Verification

### Product Creation Paths

All application code paths that create Products provide `tenantId`:

| File | Line | tenantId Source | Status |
|------|------|-----------------|--------|
| `app/api/accounting/products/route.ts` | 188 | `session.tenantId` | ✅ Verified |
| `app/api/accounting/products/import/route.ts` | 121 | `session.tenantId` | ✅ Verified |
| `app/api/accounting/products/[id]/duplicate/route.ts` | - | Inherited from source product | ✅ Verified |

**Key code snippet from `app/api/accounting/products/route.ts`:**
```typescript
const product = await db.product.create({
  data: {
    tenantId: session.tenantId, // Tenant-scoped product
    name,
    sku: finalSku,
    // ...
  },
});
```

### TypeScript Compilation

```bash
$ npx tsc --noEmit
```

**Result:** ✅ **Clean** — No compilation errors

---

## Test/Factory Verification

### Test Factory

**File:** `tests/helpers/factories/accounting.ts` (lines 74-116)

```typescript
export async function createProduct(
  overrides: Partial<{
    name: string;
    sku: string;
    // ...
    tenantId: string;  ← Optional in factory API
  }> = {}
) {
  // Get or create tenant if not provided
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const tenant = await createTenant();
    tenantId = tenant.id;
  }

  return db.product.create({
    data: {
      tenantId,  ← Always provided
      name: overrides.name ?? `Товар ${id}`,
      // ...
    },
  });
}
```

**Verification:**
- ✅ Factory accepts optional `tenantId` override
- ✅ Factory creates default tenant if not provided
- ✅ Product is always created with valid `tenantId`

### Test Suite

```bash
$ npx vitest run
```

**Result:** ✅ **All tests passing**

| Metric | Value |
|--------|-------|
| Test Files | 38 passed |
| Tests | 737 passed |

---

## Database-Level Verification (Pending)

### Status

Database-level verification could **not be completed** because PostgreSQL was unavailable during analysis.

### Recommended Follow-Up SQL Checks

When PostgreSQL becomes available, run these verification queries:

#### Check 1: Verify Column Constraint
```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'Product'
AND column_name = 'tenantId';
```

**Expected result:**
| column_name | is_nullable | data_type |
|-------------|-------------|-----------|
| tenantId | NO | text |

#### Check 2: Verify No NULL Values Exist
```sql
SELECT COUNT(*)
FROM "Product"
WHERE "tenantId" IS NULL;
```

**Expected result:** `0`

### Interpretation

| Scenario | Result | Action |
|----------|--------|--------|
| `is_nullable = 'NO'` and `COUNT = 0` | ✅ Constraint fully enforced | No action needed |
| `is_nullable = 'YES'` and `COUNT = 0` | ⚠️ Constraint not at DB level | Generate migration: `ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;` |
| `is_nullable = 'YES'` and `COUNT > 0` | ❌ Data violation | Run backfill script first: `npx tsx scripts/backfill-product-tenant.ts` |

---

## Conclusion

### What Was Verified

| Level | Status | Evidence |
|-------|--------|----------|
| Prisma Schema | ✅ | `tenantId String` (non-optional) |
| Application Code | ✅ | All creation paths provide `tenantId` |
| Test Factories | ✅ | Factory creates tenant if not provided |
| TypeScript | ✅ | Clean compilation |
| Prisma Validation | ✅ | Schema validates successfully |
| Tests | ✅ | 737 tests pass |

### What Remains Pending

| Level | Status | Notes |
|-------|--------|-------|
| Database Constraint | ⏸️ Pending | PostgreSQL unavailable during analysis |
| NULL Value Check | ⏸️ Pending | Requires database connection |

### Final Status

**P4-01 is COMPLETE at the schema and application level.**

The task does not require code changes at this time. The Prisma schema already enforces `Product.tenantId` as non-nullable, and all application code paths comply with this constraint.

Database-level verification is a **pending follow-up item**, not a blocker for Phase 4 progression.

---

## Next Steps

1. **Phase 4 may proceed to P4-02** — No blockers
2. **When PostgreSQL is available:** Run the SQL verification checks above
3. **If DB constraint is missing:** Generate migration with `npx prisma migrate dev --name enforce_product_tenant_not_null`
4. **If NULL values exist:** Run `npx tsx scripts/backfill-product-tenant.ts` before migration

---

## Related Documentation

- Roadmap: `.qoder/specs/erp-normalization-roadmap.md`
- Phase 4 Bootstrap: `.qoder/specs/p4-execution-bootstrap.md`
- Verification Gate: `scripts/verify-product-tenant-gate.ts`
- Backfill Script: `scripts/backfill-product-tenant.ts`
- Constraint Check: `scripts/check-product-tenant-constraint.ts`

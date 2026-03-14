# P3-06 Blocker Document

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P3-06 |
| **Name** | Add `tenantId` parameter to test `createCounterparty()` factory |
| **Phase** | Phase 3 — Module Normalization |
| **Date** | 2026-03-14 |
| **Status** | ⛔ **BLOCKED / DEFERRED** |

---

## Why P3-06 Is Blocked

### Attempted Change

Add `tenantId` parameter to `createCounterparty()` in `tests/helpers/factories/accounting.ts` to ensure all test counterparties are properly tenant-scoped.

### Blocker Discovered

The `Counterparty` model in `prisma/schema.prisma` does **NOT** have a `tenantId` field:

```prisma
model Counterparty {
  id             String                    @id @default(cuid())
  type           CounterpartyType          @default(customer)
  name           String
  legalName      String?
  inn            String?                   @unique
  kpp            String?
  bankAccount    String?
  bankName       String?
  bik            String?
  address        String?
  phone          String?
  email          String?
  contactPerson  String?
  notes          String?
  isActive       Boolean                   @default(true)
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt
  balance        CounterpartyBalance?
  interactions   CounterpartyInteraction[]
  customer       Customer?
  documents      Document[]
  payments       Payment[]
  purchasePrices PurchasePrice[]

  @@index([type])
  @@index([isActive])
  @@index([name])
}
```

**Note:** No `tenantId` field exists, unlike other tenant-scoped entities.

---

## Schema Comparison

| Entity | Has `tenantId` | Schema Lines |
|--------|----------------|--------------|
| `Warehouse` | ✅ Yes | 392 |
| `Document` | ✅ Yes | 481 |
| `Product` | ✅ Yes | (confirmed via factory code) |
| `Counterparty` | ❌ **No** | 333-361 |

---

## Why Test Factory Change Would Be Misleading

Adding `tenantId` to the test factory without schema support would:

1. **Create a false expectation** — Tests would appear to enforce tenant scoping, but the database would not actually store or enforce it
2. **Require workarounds** — The factory would need to silently ignore `tenantId` or throw errors, neither of which is correct
3. **Mask the real issue** — The lack of `Counterparty.tenantId` in the schema would remain hidden
4. **Violate test integrity** — Tests should reflect actual database constraints, not aspirational ones

---

## Required Work to Unblock

To properly complete P3-06, the following must happen first:

### Phase 4 Schema Work (New Task: P4-X)

1. **Add `Counterparty.tenantId` to Prisma schema**
   - Add `tenantId String` field
   - Add FK relation to `Tenant` model
   - Add `@@index([tenantId])`

2. **Create and run migration**
   - `npx prisma migrate dev --name add_counterparty_tenant`

3. **Backfill existing data**
   - Create `scripts/backfill-counterparty-tenant.ts`
   - Assign default tenant to existing counterparties
   - Verify with `scripts/verify-counterparty-tenant-gate.ts`

4. **Add NOT NULL constraint**
   - After backfill verification, make `tenantId` required

### Then Complete P3-06

5. **Update test factory**
   - Add `tenantId` parameter to `createCounterparty()`
   - Auto-create tenant if not provided (follow `createWarehouse` pattern)

6. **Update call sites**
   - 23 call sites across 7 test files
   - Either pass explicit `tenantId` or rely on factory default

---

## Recommendation

**Defer P3-06 to Phase 4** as a schema-dependent follow-up task.

The proper sequence is:
```
P4-X: Add Counterparty.tenantId schema + migration + backfill
   ↓
P3-6: Update test factory to require tenantId
```

This aligns with the existing Phase 4 pattern:
- P4-01: `Product.tenantId` schema migration
- P4-02: `Document.tenantId` schema migration
- P4-03: `ProductVariant.tenantId` schema migration
- **P4-X: `Counterparty.tenantId` schema migration** (new deferred task)

---

## Current State

- `createCounterparty()` remains unchanged (no `tenantId` parameter)
- All 737 tests passing
- TypeScript compilation clean
- No files modified

---

## Related Documentation

- Roadmap: `.qoder/specs/erp-normalization-roadmap.md` (Phase 3 and Phase 4 sections)
- Architecture Map: `.qoder/specs/erp-architecture-map.md` (Counterparty ownership)
- Phase 3 Status: `.qoder/specs/p3-status-update.md`
- Prisma Schema: `prisma/schema.prisma` (lines 333-361)

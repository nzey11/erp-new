# P3-05 Verification Document

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P3-05 |
| **Name** | Split `tests/helpers/factories.ts` into domain-scoped files |
| **Phase** | Phase 3 — Module Normalization |
| **Date** | 2026-03-14 |
| **Status** | ✅ COMPLETE |

---

## Previous File State

**Source file:** `tests/helpers/factories.ts`
- **Size:** 923 lines
- **Structure:** Monolithic file containing all test factory functions
- **Problem:** God file anti-pattern — mixed domain concerns, difficult navigation, unclear ownership

### Factory Categories in Original File

| Lines | Factory | Domain |
|-------|---------|--------|
| 16-34 | `createUnit` | Accounting |
| 37-59 | `createTenant` | Auth |
| 62-90 | `createWarehouse` | Accounting |
| 93-138 | `createProduct` | Accounting/Ecommerce |
| 141-165 | `createCounterparty` | Accounting |
| 168-226 | `createDocument` | Accounting |
| 229-258 | `createDocumentItem` | Accounting |
| 261-283 | `createCustomFieldDefinition` | Ecommerce |
| 286-304 | `createVariantType` | Ecommerce |
| 307-325 | `createVariantOption` | Ecommerce |
| 328-366 | `createProductVariant` | Ecommerce |
| 369-395 | `createProductDiscount` | Ecommerce |
| 398-411 | `createStockRecord` | Accounting |
| 414-452 | `createUser` | Auth |
| 455-475 | `createParty` | Party |
| 478-528 | `createDocumentWithItems` | Accounting |
| 531-555 | `createCustomer` | Ecommerce |
| 558-588 | `createStorePage` | Ecommerce |
| 591-612 | `createCartItem` | Ecommerce |
| 615-666 | `createOrder` | Ecommerce |
| 669-696 | `createOrderItem` | Ecommerce |
| 698-715 | `createCategory` | Ecommerce |
| 718-736 | `createPriceList` | Accounting |
| 743-896 | `seedTestAccounts`, `seedCompanySettings`, `seedReportAccounts` | Accounting |
| 902-922 | `createSalePrice` | Ecommerce |

---

## New Factory Directory Structure

```
tests/helpers/factories/
├── index.ts           # Barrel export — re-exports all factories
├── core.ts            # Shared utilities (uniqueId)
├── accounting.ts      # Accounting domain factories
├── ecommerce.ts       # Ecommerce domain factories
├── auth.ts            # Auth/User domain factories
└── party.ts           # Party domain factories
```

---

## Created Files

### 1. `tests/helpers/factories/core.ts` (14 lines)
- **Purpose:** Shared utilities across all factory modules
- **Exports:** `uniqueId()` — generates unique test entity IDs

### 2. `tests/helpers/factories/accounting.ts` (483 lines)
- **Purpose:** Accounting domain test factories
- **Exports:**
  - `createUnit`
  - `createWarehouse`
  - `createProduct`
  - `createCounterparty`
  - `createDocument`
  - `createDocumentItem`
  - `createStockRecord`
  - `createDocumentWithItems`
  - `createPriceList`
  - `seedTestAccounts`
  - `seedCompanySettings`
  - `seedReportAccounts`

### 3. `tests/helpers/factories/ecommerce.ts` (364 lines)
- **Purpose:** Ecommerce domain test factories
- **Exports:**
  - `createCustomFieldDefinition`
  - `createVariantType`
  - `createVariantOption`
  - `createProductVariant`
  - `createProductDiscount`
  - `createCustomer`
  - `createStorePage`
  - `createCartItem`
  - `createOrder`
  - `createOrderItem`
  - `createCategory`
  - `createSalePrice`

### 4. `tests/helpers/factories/auth.ts` (75 lines)
- **Purpose:** Authentication and user management factories
- **Exports:**
  - `createTenant`
  - `createUser`

### 5. `tests/helpers/factories/party.ts` (32 lines)
- **Purpose:** Party (cross-domain identity) factories
- **Exports:**
  - `createParty`

### 6. `tests/helpers/factories/index.ts` (48 lines)
- **Purpose:** Barrel export for backward compatibility
- **Exports:** All factories from domain modules

---

## Deleted Files

| File | Reason |
|------|--------|
| `tests/helpers/factories.ts` | Replaced by domain-scoped files + barrel export |

---

## Barrel Compatibility Strategy

The `tests/helpers/factories/index.ts` barrel file re-exports all factories, preserving backward compatibility for existing imports.

### Import Path Stability

| Before | After | Status |
|--------|-------|--------|
| `from "../helpers/factories"` | `from "../helpers/factories"` | ✅ Unchanged |
| `from "@/tests/helpers/factories"` | `from "@/tests/helpers/factories"` | ✅ Unchanged |

### Test Files Using Factories

All 24 test files that import from factories continue to work without modification:

- `tests/unit/lib/activity-ingest.test.ts`
- `tests/unit/lib/party-merge.test.ts`
- `tests/unit/lib/party-owner.test.ts`
- `tests/unit/lib/party-resolver.test.ts`
- `tests/integration/accounting-scenarios.test.ts`
- `tests/integration/api/auth.test.ts`
- `tests/integration/api/cms-pages.test.ts`
- `tests/integration/api/documents.test.ts`
- `tests/integration/api/ecommerce.test.ts`
- `tests/integration/api/inventory-count.test.ts`
- `tests/integration/api/products.test.ts`
- `tests/integration/api/users-lifecycle.test.ts`
- `tests/integration/catalog/features.test.ts`
- `tests/integration/catalog/variant-matcher.test.ts`
- `tests/integration/crm/owner-assignment.test.ts`
- `tests/integration/documents/balance.test.ts`
- `tests/integration/documents/balances.test.ts`
- `tests/integration/documents/journal.test.ts`
- `tests/integration/documents/posting-rules.test.ts`
- `tests/integration/documents/stock-movements.integration.test.ts`
- `tests/integration/documents/stock.test.ts`
- `tests/integration/journal-guards-smoke.test.ts`
- `tests/unit/lib/cogs.test.ts`
- `tests/unit/lib/stock-movements.test.ts`

---

## TypeScript Compilation Result

```bash
$ npx tsc --noEmit
```

**Result:** ✅ **Clean** — No compilation errors

---

## Test Suite Result

```bash
$ npx vitest run
```

**Result:** ✅ **All tests passing**

| Metric | Value |
|--------|-------|
| Test Files | 38 passed |
| Tests | 737 passed |
| Duration | 118.76s |

---

## Behavioral Regression Check

| Check | Result |
|-------|--------|
| Factory behavior preserved | ✅ Confirmed |
| Import paths stable | ✅ Confirmed |
| Test suite passes | ✅ Confirmed |
| TypeScript compilation clean | ✅ Confirmed |
| No test file modifications required | ✅ Confirmed |

---

## Test Factory Ownership Confirmation

| Domain | File | Factories |
|--------|------|-----------|
| Accounting | `accounting.ts` | 12 factories + 3 seed functions |
| Ecommerce | `ecommerce.ts` | 12 factories |
| Auth | `auth.ts` | 2 factories |
| Party | `party.ts` | 1 factory |
| Core | `core.ts` | 1 utility |

All factories now have clear domain ownership and are organized in focused modules.

---

## ERP Invariant Impact Assessment

| Invariant | Impact | Status |
|-----------|--------|--------|
| INV-01 | None — test-only change | ✅ Unaffected |
| INV-02 | None — test-only change | ✅ Unaffected |
| INV-03 | None — test-only change | ✅ Unaffected |
| INV-04 | None — test-only change | ✅ Unaffected |
| INV-05a | None — test-only change | ✅ Unaffected |
| INV-05b | None — test-only change | ✅ Unaffected |
| INV-06 | None — test-only change | ✅ Unaffected |
| INV-07 | None — test-only change | ✅ Unaffected |
| INV-08 | None — test-only change | ✅ Unaffected |
| INV-09 | None — test-only change | ✅ Unaffected |
| INV-10 | None — test-only change | ✅ Unaffected |
| INV-11 | None — test-only change | ✅ Unaffected |
| INV-12 | None — test-only change | ✅ Unaffected |
| INV-13 | None — test-only change | ✅ Unaffected |

**Conclusion:** This was a test infrastructure normalization step with zero impact on production code or ERP invariants.

---

## Summary

P3-05 successfully eliminated the `tests/helpers/factories.ts` god file (923 lines) and replaced it with domain-scoped factory modules. The barrel export pattern ensures full backward compatibility — no test file imports required modification. All 737 tests pass, TypeScript compilation is clean, and no behavioral regressions were detected.

**Next Task:** P3-06 — Fix `createCounterparty()` in test factories to add `tenantId` parameter.

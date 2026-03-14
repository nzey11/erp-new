# P3-03 Verification Report

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P3-03 — Move `recalculateBalance()` to `accounting/services/balance.service.ts` |
| **Status** | ✅ COMPLETE |
| **Date Completed** | 2026-03-14 |
| **Phase** | Phase 3 — Module Normalization |

---

## Function Relocation

### Previous Location

**File**: `lib/modules/finance/reports.ts`  
**Lines**: 43-89  
**Classification**: Misplaced write operation in read-oriented module

### New Location

**File**: `lib/modules/accounting/services/balance.service.ts`  
**Lines**: 1-70  
**Classification**: Application service (owns write operations)

### Rationale

Per canonical module structure:
- `services/` — Application services own all write operations
- `finance/reports.ts` — Read-only reporting module
- `recalculateBalance()` performs `db.counterpartyBalance.upsert()` (write)

---

## Files Changed

### Created (1 file)

| File | Purpose |
|------|---------|
| `lib/modules/accounting/services/balance.service.ts` | New home for `recalculateBalance()` |

### Modified (5 files)

| # | File | Change |
|---|------|--------|
| 1 | `lib/modules/accounting/index.ts` | Added barrel export for balance service |
| 2 | `lib/modules/accounting/handlers/balance-handler.ts` | Updated import path |
| 3 | `lib/modules/accounting/services/document-confirm.service.ts` | Updated import path (relative) |
| 4 | `tests/integration/documents/balance.test.ts` | Split imports between new and old locations |
| 5 | `lib/modules/finance/reports.ts` | Removed `recalculateBalance()` function |

---

## Import Updates

### Consumer Files Updated

| # | File | Before | After |
|---|------|--------|-------|
| 1 | `balance-handler.ts` | `@/lib/modules/finance/reports` | `@/lib/modules/accounting/services/balance.service` |
| 2 | `document-confirm.service.ts` | `@/lib/modules/finance/reports` | `./balance.service` (relative) |
| 3 | `balance.test.ts` | `@/lib/modules/finance/reports` (both functions) | Split: `balance.service` + `finance/reports` |

---

## getBalance() Confirmation

**Status**: ✅ **Remains in `finance/reports.ts`**

| Function | Location | Rationale |
|----------|----------|-----------|
| `recalculateBalance()` | `accounting/services/balance.service.ts` | Write operation (upserts balance record) |
| `getBalance()` | `finance/reports.ts` | Read-only operation (queries balance) |

This separation maintains proper module boundaries:
- Write operations → Accounting service
- Read operations → Finance reports

---

## Verification Results

### TypeScript Compilation

```bash
npx tsc --noEmit
```

**Result**: ✅ Clean (no errors)

### Test Suite

```bash
npx vitest run
```

**Result**: ✅ 748 tests passed (38 test files)

### Behavioral Regression Check

| Check | Result |
|-------|--------|
| Function implementation unchanged | ✅ Yes (identical code) |
| All imports resolved | ✅ Yes |
| No duplicate function definitions | ✅ Yes |
| Test coverage maintained | ✅ Yes |

**Conclusion**: No behavioral regressions detected.

---

## Current Ownership Confirmation

### recalculateBalance()

- **Location**: `lib/modules/accounting/services/balance.service.ts`
- **Module**: Accounting
- **Type**: Application service
- **Responsibility**: Write-side balance recalculation

### finance/reports.ts

- **Status**: Remains read-oriented
- **Exports**: `getBalance()`, `getAllBalances()`, report generators
- **No write operations**: ✅ Confirmed

---

## ERP Invariants Status

All invariants remain unaffected by this relocation:

| Invariant | Description | Status |
|-----------|-------------|--------|
| INV-06 | Document confirm → CounterpartyBalance | ✅ Unaffected (same handler, new import path) |
| INV-07 | Document confirm → Finance Journal | ✅ Unaffected (unrelated to this change) |
| INV-08 | Payment mark → Document confirm | ✅ Unaffected (unrelated to this change) |
| INV-11 | Outbox is sole event path | ✅ Unaffected (unrelated to this change) |

**Note**: INV-06 is maintained through `balance-handler.ts` which now imports from the new location. The handler logic is unchanged.

---

## Success Criteria Verification

Per Phase 3 Success Criteria:

| Criterion | Target | Status |
|-----------|--------|--------|
| `recalculateBalance()` is not in `finance/reports.ts` | Removed | ✅ Verified (function deleted from finance module) |

---

## Summary

P3-03 completed successfully. The `recalculateBalance()` function has been moved from `finance/reports.ts` (read-oriented module) to `accounting/services/balance.service.ts` (write-oriented service module), aligning with the canonical architecture where services own write operations.

**Key points:**
- Function implementation unchanged (pure relocation)
- `getBalance()` remains in `finance/reports.ts` (read-only, appropriate location)
- All 3 call sites updated with correct import paths
- Barrel export added for discoverability
- No behavioral changes — all 748 tests pass
- Module boundaries now properly respected

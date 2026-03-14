# Phase 3 — Execution Bootstrap

**Date:** 2026-03-14  
**Status:** PLANNING — AWAITING P3-01 EXECUTION  
**Prerequisites:** Phase 2 complete and deployed (verified in `p2-post-deploy-verification.md`)

---

## 1. Phase 3 Objective

Eliminate navigation complexity: god files, dual directories, misplaced logic. Bring all modules to the canonical structure defined in Section 6 of the roadmap.

**Key Problems to Solve:**
- `lib/modules/ecom/` vs `lib/modules/ecommerce/` — split domain creates confusion
- `lib/modules/ecom/orders.ts` (642 lines) — god file mixing multiple responsibilities
- `tests/helpers/factories.ts` (923 lines) — monolithic test factory
- `recalculateBalance()` misplaced in `finance/reports.ts` (write op in read module)
- Legacy `recalculateStock()` path still exists alongside canonical `reconcileStockRecord()`
- `publishDocumentConfirmed()` dead code still present
- Party merge doesn't atomically update PartyLink records

---

## 2. Exact Ordered List of Phase 3 Tasks

Per `erp-normalization-roadmap.md` Section 4 (Phase 3 — Module Normalization), tasks must be executed in this order:

| Order | Task | Description | Files Affected |
|-------|------|-------------|----------------|
| 1 | **P3-01** | Merge `lib/modules/ecom/` into `lib/modules/ecommerce/` | All files importing from `@/lib/modules/ecom/` |
| 2 | **P3-02** | Split `ecommerce/orders.ts` (post-merge) into focused services | `ecommerce/services/`, `ecommerce/queries/` |
| 3 | **P3-03** | Move `recalculateBalance()` to `accounting/services/balance.service.ts` | `finance/reports.ts`, `accounting/services/` |
| 4 | **P3-04** | Deprecate and remove legacy stock calculation functions | `accounting/inventory/stock.ts` |
| 5 | **P3-05** | Split `tests/helpers/factories.ts` into domain-scoped files | `tests/helpers/factories/` |
| 6 | **P3-06** | Add `tenantId` parameter to test `createCounterparty()` | `tests/helpers/factories/`, all test call sites |
| 7 | **P3-07** | Remove `publishDocumentConfirmed()` dead code | `document-confirm.service.ts` |
| 8 | **P3-08** | Fix Party merge: atomically update PartyLink records | `lib/party/services/` merge service |

---

## 3. Dependencies Between P3 Tasks

```
P3-01 (Merge ecom → ecommerce)
    │
    ├── Required for P3-02 ──→ P3-02 (Split orders.ts)
    │                           └── Requires P3-01 complete because
    │                               orders.ts moves from ecom/ to ecommerce/
    │
    └── Independent tasks ───→ P3-03, P3-04, P3-05, P3-06, P3-07, P3-08
                                (can run in parallel after P3-01,
                                 but sequential is safer)
```

**Critical Path:** P3-01 → P3-02

**Soft Dependencies:**
- P3-05 should precede P3-06 (factory split before modifying `createCounterparty`)
- P3-04 should verify no callers remain (may grep across codebase including scripts)

---

## 4. P3-01: The Starting Point

### What P3-01 Does

Merge `lib/modules/ecom/` into `lib/modules/ecommerce/`.

`lib/modules/ecom/` was created as a temporary relocation. All exports must be re-homed under `lib/modules/ecommerce/` with appropriate subdirectory structure. Update all import paths.

### Current State

| Directory | Contents |
|-----------|----------|
| `lib/modules/ecom/` | `orders.ts` (642 lines, 17KB) — the god file |
| `lib/modules/ecommerce/` | `cart.ts`, `cms.ts`, `delivery.ts`, `payment.ts`, `index.ts`, `handlers/`, `projections/`, `schemas/` |

### Files Importing from `@/lib/modules/ecom/` (19 matches)

| File | Import |
|------|--------|
| `app/api/accounting/ecommerce/orders/[id]/route.ts` | `updateOrderStatus`, `confirmEcommerceOrderPayment`, `cancelEcommerceOrder` |
| `app/api/accounting/ecommerce/orders/route.ts` | `getAllEcomOrders` |
| `app/api/ecommerce/checkout/route.ts` | `createSalesOrderFromCart` |
| `app/api/ecommerce/orders/quick-order/route.ts` | `createSalesOrderFromCart` |
| `app/api/ecommerce/orders/route.ts` | `getCustomerOrders` |
| `lib/modules/ecommerce/payment.ts` | `confirmOrderPayment` |

### Target Structure Post-P3-01

```
lib/modules/ecommerce/
  ├── index.ts                    ← Public barrel export
  ├── cart.ts                     ← Existing
  ├── cms.ts                      ← Existing
  ├── delivery.ts                 ← Existing
  ├── payment.ts                  ← Existing (will need import update)
  ├── orders.ts                   ← MOVED from ecom/orders.ts
  ├── handlers/                   ← Existing
  ├── projections/                ← Existing
  ├── schemas/                    ← Existing
  └── project.json                ← Existing
```

---

## 5. Why P3-01 Is the Correct Starting Point

### 1. **Structural Foundation**
P3-01 establishes the canonical module location. All subsequent P3 tasks that touch ecommerce code depend on knowing where that code lives.

### 2. **P3-02 Direct Dependency**
P3-02 splits `orders.ts` into focused services. This cannot begin until `orders.ts` is in its final location (`ecommerce/orders.ts` not `ecom/orders.ts`).

### 3. **Import Path Stability**
P3-01 updates all 19 import paths from `@/lib/modules/ecom/*` to `@/lib/modules/ecommerce/*`. Doing this once at the start prevents cascading import changes later.

### 4. **Risk Isolation**
Per roadmap: "P3-01 merge is safer once event wiring is verified" — Phase 2 is complete, so the event wiring (outbox handlers) is verified and stable.

### 5. **Roadmap Order**
The roadmap explicitly lists P3-01 first. The project follows strict sequential execution.

---

## 6. What Must NOT Be Changed Outside P3-01 Scope

### In Scope for P3-01 ONLY:
- ✅ Move `lib/modules/ecom/orders.ts` → `lib/modules/ecommerce/orders.ts`
- ✅ Update all import paths from `@/lib/modules/ecom/*` to `@/lib/modules/ecommerce/*`
- ✅ Ensure `lib/modules/ecommerce/index.ts` exports the moved functionality
- ✅ Verify `lib/modules/ecom/` directory can be deleted (empty after move)

### NOT In Scope (Future P3 Tasks):
- ❌ **Do NOT split `orders.ts`** — that's P3-02
- ❌ **Do NOT refactor `orders.ts` internals** — behavior must be identical
- ❌ **Do NOT move `recalculateBalance()`** — that's P3-03
- ❌ **Do NOT touch stock functions** — that's P3-04
- ❌ **Do NOT touch test factories** — that's P3-05/P3-06
- ❌ **Do NOT remove `publishDocumentConfirmed()`** — that's P3-07
- ❌ **Do NOT fix Party merge** — that's P3-08

### Verification Constraint:
After P3-01, the only observable change should be:
- `lib/modules/ecom/` no longer exists
- `lib/modules/ecommerce/orders.ts` exists with identical content to former `ecom/orders.ts`
- All imports work correctly
- TypeScript compiles without errors (`tsc --noEmit`)
- All tests pass

---

## 7. Sequential Execution Confirmation

**Phase 3 will be executed sequentially, one task at a time.**

| Task | Status | Entry Criteria |
|------|--------|----------------|
| P3-01 | ⏳ **NEXT** | Phase 2 verified complete, this bootstrap document approved |
| P3-02 | ⏳ Blocked | P3-01 complete, import paths stable |
| P3-03 | ⏳ Blocked | P3-01 complete (can run parallel to P3-02, but sequential preferred) |
| P3-04 | ⏳ Blocked | P3-01 complete |
| P3-05 | ⏳ Blocked | P3-01 complete |
| P3-06 | ⏳ Blocked | P3-05 complete (factory structure established) |
| P3-07 | ⏳ Blocked | P3-01 complete |
| P3-08 | ⏳ Blocked | P3-01 complete |

**Execution Policy:**
- No task begins until the previous task is fully complete and verified
- Each task requires explicit instruction to begin
- Each task completion requires verification before next task starts
- No batching of tasks

---

## 8. Pre-Flight Checklist for P3-01

Before beginning P3-01 execution:

- [ ] This bootstrap document reviewed and approved
- [ ] `tsc --noEmit` baseline run (record error count)
- [ ] Test suite baseline run (record pass/fail count)
- [ ] All 19 files importing from `@/lib/modules/ecom/` identified (see Section 4)
- [ ] Rollback plan confirmed (git revert capability)

---

## 9. Success Criteria for P3-01

Per roadmap Section 4 (Phase 3 — Success Criteria):

| Criterion | Verification |
|-----------|--------------|
| `lib/modules/ecom/` directory does not exist | `ls lib/modules/ecom/` → "No such file or directory" |
| `lib/modules/ecommerce/orders.ts` exists | `ls lib/modules/ecommerce/orders.ts` → file present |
| All imports updated | `grep -r "from.*@/lib/modules/ecom" --include="*.ts" .` → 0 matches |
| TypeScript compiles | `npx tsc --noEmit` → clean |
| Tests pass | `npx vitest run` → all pass |
| No behavioral changes | Function signatures identical, no logic modifications |

---

## 10. Risk Mitigation (Per Roadmap)

> **P3-01 Risk:** Import path changes affect a large number of files. Run TypeScript compiler (`tsc --noEmit`) after the merge to catch broken imports before testing.

**Mitigation Plan:**
1. Move file first
2. Update imports immediately
3. Run `tsc --noEmit` before any test run
4. Fix any type errors before proceeding
5. Run full test suite only after TypeScript is clean

---

*Bootstrap document complete. Awaiting explicit instruction to begin P3-01 execution.*

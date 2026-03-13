# ERP Test Guardian — Output Examples

## Example 1: PR touches StockMovementService

**Changed files:**
```
lib/modules/stock-movements.ts
app/api/accounting/documents/[id]/confirm/route.ts
```

---

### SUMMARY

```
PR affects critical domain: stock-movement
Risk level: HIGH

Missing coverage:
- idempotency: duplicate confirm does not create second movement
- cancel creates reversing movement with negative quantity
- stock invariant: quantity stays >= 0 after cancel
- transaction rollback on DB error leaves no partial state
```

---

### ROADMAP

```
1. Service tests
   File: tests/unit/lib/stock-movements.test.ts
   Scenarios:
   - confirm() creates StockMovement record
   - confirm() called twice → only 1 movement created (idempotency)
   - cancel() creates reversing movement (negative qty)
   - cancel() restores StockRecord.quantity to original value
   - stock invariant: quantity never goes negative

2. Integration tests
   File: tests/integration/stock-movements.test.ts
   Scenarios:
   - transaction rollback on error → no partial StockMovement
   - unique constraint: P2002 on duplicate movement
   - StockRecord.quantity === SUM of all movements for product+warehouse

3. E2E smoke
   File: tests/e2e/specs/stock-movements.spec.ts
   Scenarios:
   - POST /api/accounting/documents/:id/confirm → 200
   - POST /api/accounting/documents/:id/cancel → 200
   - GET /api/accounting/stock → correct quantity returned
```

---

### PATCH

```
+ tests/unit/lib/stock-movements.test.ts      (service tests)
+ tests/integration/stock-movements.test.ts   (integration tests)
+ tests/helpers/stock-assertions.ts           (assertion helpers)
+ tests/helpers/idempotency-assertions.ts     (idempotency helpers)
```

---

## Example 2: PR touches only catalog (low-risk)

**Changed files:**
```
lib/modules/catalog.ts
components/accounting/catalog/CatalogForm.tsx
```

---

### SUMMARY

```
PR affects domain: catalog
Risk level: LOW

No critical domain coverage gaps detected.
Existing unit tests sufficient for this domain.
```

---

### ROADMAP

```
No new test files required.

Optional improvement:
- Add unit test for new catalog validation logic if added.
```

---

### PATCH

```
No files to generate.
```

---

## Example 3: First-run Project Audit Output

```
=== ERP Test Coverage Map (current — post Phase 4 / v1 Baseline) ===

Domain               | Unit | Integration | E2E | Risk   | Status
---------------------|------|-------------|-----|--------|----------
stock-movement       |  ✓   |      ✓      |  ✗  | HIGH   | COVERED
stock / StockRecord  |  ✓   |      ✓      |  ✗  | HIGH   | COVERED
documents (generic)  |  ✓   |      ✓      |  ✗  | HIGH   | COVERED
document-confirm     |  N/A |      ✓      |  ✗  | HIGH   | COVERED
inventory_count      |  N/A |      ✓      |  ✗  | HIGH   | COVERED ← Phase 2
journal / autoPost   |  N/A |      ✓      |  ✗  | HIGH   | COVERED ← Phase 1
cogs                 |  ✓   |     N/A     |  ✗  | HIGH   | COVERED ← Phase 1
posting-rules        |  N/A |      ✓      |  ✗  | HIGH   | COVERED ← Phase 3 (19 tests)
balance              |  N/A |      ✓      |  ✗  | HIGH   | COVERED
accounts / Chart     |  N/A |      ✓      |  ✗  | MED    | COVERED ← Phase 4 (15 tests)
balances.ts          |  N/A |      ✓      |  ✗  | MED    | COVERED ← Phase 4 (17 tests)
finance reports 1/2/4|  N/A |      ✓      |  ✗  | MED    | COVERED ← Phase 4 (13 tests)
variant-matcher      |  N/A |      ✓      |  ✗  | LOW    | COVERED ← Phase 3 (11 tests)
warehouse            |  ✗   |      ✗      |  ✗  | HIGH   | GAP (service layer not yet built)
catalog              |  ✓   |      ✓      |  ✗  | MED    | ADEQUATE
auth                 |  ✓   |      ✓      |  ✗  | MED    | ADEQUATE
ecommerce            |  N/A |      ✓      |  ✗  | LOW    | ADEQUATE

Total tests: 481 (288 integration + 193 unit) — all passing

=== v1 Baseline Status ===

COMPLETE:
  Infrastructure: cleanDatabase, seedTestAccounts, seedCompanySettings, factories
  HIGH-risk domains: all covered except warehouse (not yet a service layer)
  MED-risk domains: accounts, balances.ts, finance reports all covered

REMAINING GAP:
  1. warehouse service (when service layer appears)
  2. E2E smoke for key flows (optional until launch)
  3. runPostConfirmEffects integration via explicit flush (low priority)
```

---

## Example 4: PR touches `inventory_count` confirm flow

**Changed files:**
```
lib/modules/accounting/services/document-confirm.service.ts
app/api/accounting/documents/[id]/confirm/route.ts
```

---

### SUMMARY

```
PR affects critical domain: inventory_count (document-confirm)
Risk level: HIGH

Missing coverage:
- shortage creates write_off linked doc (adjustmentsCreated = true)
- surplus creates stock_receipt linked doc (adjustmentsCreated = true)
- mixed case creates both write_off and stock_receipt
- no discrepancies → no adjustment docs, flag stays false
- write_off StockMovement qty = negative difference
- stock_receipt StockMovement qty = positive difference
- cancel does NOT create reversing movements (affectsStock=false for inventory_count)
- cancel does NOT cascade-cancel linked adjustment docs
```

---

### ROADMAP

```
1. Integration tests (domain-isolated file)
   File: tests/integration/api/inventory-count.test.ts
   Suites:
   - confirm → adjustment document creation (4 tests)
     • shortage → write_off linked doc + adjustmentsCreated = true
     • surplus → stock_receipt linked doc + adjustmentsCreated = true
     • mixed → both write_off and stock_receipt created
     • no discrepancies → no docs, flag stays false
   - confirm validation (4 tests)
     • null actualQty → 400
     • null warehouseId → 400
     • no items → 400
     • already confirmed → 400
   - stock movements after confirm (2 tests)
     • write_off adj has StockMovement with negative qty
     • stock_receipt adj has StockMovement with positive qty
   - cancel confirmed inventory_count (3 tests)
     • cancel sets status = cancelled
     • cancel does NOT create reversing StockMovements
     • cancel does NOT cascade-cancel linked adjustment docs

2. No E2E additions needed — existing confirm/cancel smoke sufficient
```

---

### PATCH

```
+ tests/integration/api/inventory-count.test.ts   (new domain-isolated suite)
```

**No production code changes required.** The domain logic (`createInventoryAdjustments`) is in the critical path of `confirmDocumentTransactional` and is already correctly awaited.

**Architecture note:** `runPostConfirmEffects` is fire-and-forget — journal entries and balance updates are NOT part of this test suite and must NOT be asserted here without explicit flush.

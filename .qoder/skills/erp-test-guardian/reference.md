# ERP Test Guardian — Reference

## Critical Domain Registry

| Domain keyword               | Risk  | Required layers               | Notes                                      |
|------------------------------|-------|-------------------------------|--------------------------------------------|
| stock-movement               | HIGH  | service + integration         | isReversing movements for cancel           |
| stock / StockRecord          | HIGH  | service + integration         | quantity projection, never negative        |
| warehouse                    | HIGH  | service + integration         |                                            |
| documents / Document         | HIGH  | service + integration         |                                            |
| document-confirm             | HIGH  | integration (route-level)     | two-phase confirm; see architecture note   |
| inventory_count              | HIGH  | integration (domain-isolated) | creates linked write_off/stock_receipt     |
| posting-rules                | HIGH  | integration                   | CRLF→LF fixed in Phase 3; 19 tests passing  |
| transfer / Transfer          | HIGH  | service + integration         |                                            |
| writeoff / WriteOff          | HIGH  | service + integration         |                                            |
| journal / autoPost           | HIGH  | service + integration         | fire-and-forget in runPostConfirmEffects   |
| reconciliation               | HIGH  | service + integration         |                                            |
| accounts / Chart of Accounts | MED   | integration                   | delete guards, getAccountBalance (Phase 4) |
| balances.ts / ledger queries  | MED   | integration                   | getAccountBalance/Turnovers/TrialBalance (Phase 4) |
| finance/reports (Form 1/2/4) | MED   | integration                   | P&L, BalanceSheet, CashFlow (Phase 4)     |
| counterparty                 | MED   | unit                          |                                            |
| auth / session               | MED   | unit                          |                                            |
| ecommerce / cart / checkout  | LOW   | unit                          |                                            |

Coverage targets:
- HIGH domains: 80–90 % lines, mandatory service + integration tests
- MED domains: 50–60 % lines, unit tests sufficient
- LOW domains: no hard minimum

---

## File Patterns to Detect Domain

```
lib/modules/accounting/stock*                         → stock-movement (HIGH)
lib/modules/accounting/stock-movements.ts             → stock-movement (HIGH)
lib/modules/accounting/services/document-confirm*     → document-confirm (HIGH)
lib/modules/accounting/journal*                       → journal (HIGH)
lib/modules/accounting/posting-rules*                 → posting-rules (HIGH)
lib/modules/accounting/documents*                     → documents (HIGH)
app/api/accounting/documents/[id]/confirm/route.ts    → document-confirm (HIGH)
app/api/accounting/documents/[id]/cancel/route.ts     → cancel flow (HIGH)
```

---

## Service Test Template

```typescript
// tests/unit/lib/<domain>.test.ts
// NOTE: These are pure-function unit tests — no DB, no Prisma.
import { describe, it, expect } from 'vitest'
import { <pureFunction> } from '@/lib/modules/accounting/<domain>'

describe('<pureFunction>', () => {
  it('happy path — returns expected value', () => {
    expect(<pureFunction>(input)).toBe(expected)
  })

  it('edge case — handles zero/null/empty', () => {
    expect(<pureFunction>(edgeInput)).toBe(edgeExpected)
  })
})
```

> Use this template ONLY for pure functions (no DB access).
> For anything that touches Prisma, use the Integration Test Template below.

---

## Integration Test Template (API route level)

```typescript
// tests/integration/api/<domain>.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from '../../helpers/api-client'
import { createUser, createWarehouse, createProduct, createDocument, createDocumentItem } from '../../helpers/factories'
import { getTestDb } from '../../helpers/test-db'

// Auth must be mocked BEFORE importing the route
vi.mock('@/lib/shared/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shared/auth')>()
  return { ...actual, getAuthSession: vi.fn() }
})

import { POST as CONFIRM } from '@/app/api/accounting/documents/[id]/confirm/route'
import { POST as CANCEL } from '@/app/api/accounting/documents/[id]/cancel/route'

describe('API: <domain> flow', () => {
  let adminUser: Awaited<ReturnType<typeof createUser>>
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>

  beforeEach(async () => {
    adminUser = await createUser({ role: 'admin' })
    warehouse = await createWarehouse()
    mockAuthNone()
  })

  // cleanDatabase() is called automatically via tests/setup.ts

  it('confirm → creates expected records', async () => {
    mockAuthUser(adminUser)
    const doc = await createDocument({ type: '<docType>', warehouseId: warehouse.id })
    // add items...

    const req = createTestRequest(`/api/accounting/documents/${doc.id}/confirm`, { method: 'POST' })
    const res = await CONFIRM(req, { params: Promise.resolve({ id: doc.id }) })

    expect(res.status).toBe(200)
    const db = getTestDb()
    // assert DB state...
  })

  it('cancel → sets status = cancelled', async () => {
    mockAuthUser(adminUser)
    // ...
    const req = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, { method: 'POST' })
    const res = await CANCEL(req, { params: Promise.resolve({ id: doc.id }) })
    expect(res.status).toBe(200)
    const data = await jsonResponse(res)
    expect(data.status).toBe('cancelled')
  })
})
```

> `cleanDatabase()` runs automatically in `beforeEach` via `tests/setup.ts` — do NOT add it again in your test file.

---

## Stock Assertions Helper

```typescript
// tests/helpers/stock-assertions.ts
import { PrismaClient } from '@prisma/client'

export async function assertStockQuantity(
  prisma: PrismaClient,
  productId: string,
  warehouseId: string,
  expected: number
) {
  const record = await prisma.stockRecord.findFirst({
    where: { productId, warehouseId },
  })
  expect(record?.quantity ?? 0).toBe(expected)
}

export async function assertStockNonNegative(
  prisma: PrismaClient,
  productId: string,
  warehouseId: string
) {
  const record = await prisma.stockRecord.findFirst({
    where: { productId, warehouseId },
  })
  expect(record?.quantity ?? 0).toBeGreaterThanOrEqual(0)
}
```

---

## Idempotency Assertions Helper

```typescript
// tests/helpers/idempotency-assertions.ts
import { PrismaClient } from '@prisma/client'

export async function assertNoDuplicateMovements(
  prisma: PrismaClient,
  documentId: string
) {
  const movements = await prisma.stockMovement.findMany({
    where: { documentId },
  })
  const ids = movements.map((m) => m.id)
  expect(new Set(ids).size).toBe(ids.length)
}

export async function assertIdempotentConfirm(
  confirmFn: () => Promise<void>,
  countFn: () => Promise<number>
) {
  await confirmFn()
  const after1 = await countFn()
  await confirmFn()
  const after2 = await countFn()
  expect(after1).toBe(after2)
}
```

---

## Factory Pattern (actual project — uses db singleton, no prisma param)

```typescript
// tests/helpers/factories.ts — actual API
import { createUser, createWarehouse, createProduct } from '../../helpers/factories'

// All factories use db singleton from @/lib/shared/db internally.
// DO NOT pass a PrismaClient param — that is the old pattern.

// Examples:
const user      = await createUser({ role: 'admin' })
const warehouse = await createWarehouse({ name: 'Main' })
const product   = await createProduct({ name: 'Widget' })
const doc       = await createDocument({ type: 'inventory_count', warehouseId: warehouse.id })
const item      = await createDocumentItem(doc.id, product.id, {
  quantity: 0, price: 100, expectedQty: 10, actualQty: 6
})

// For accounting/journal tests — seed required lookup data:
const accountIds = await seedTestAccounts()   // Chart of Accounts + JournalCounter
const settings   = await seedCompanySettings(accountIds)
```

---

## Test Directory Structure (actual — as of Phase 4)

```
tests/
  helpers/
    api-client.ts          ← createTestRequest, mockAuthUser, jsonResponse
    factories.ts           ← createUser/Warehouse/Product/Document/DocumentItem
                              seedTestAccounts, seedCompanySettings
    stock-assertions.ts    ← assertStockQuantity, assertStockNonNegative
    test-db.ts             ← getTestDb(), cleanDatabase(), cleanJournal()
  unit/lib/
    auth.test.ts
    cogs.test.ts           ← COGS pure functions (Phase 1)
    document-states.test.ts
    documents.test.ts      ← pure document helpers
    rate-limit.test.ts
    stock-movements.test.ts
  integration/
    api/
      auth.test.ts
      cms-pages.test.ts
      documents.test.ts    ← generic confirm/cancel for stock_receipt etc.
      ecommerce.test.ts
      inventory-count.test.ts  ← inventory_count full domain suite (Phase 2)
      products.test.ts
    catalog/
      features.test.ts
      variant-matcher.test.ts  ← findVariantSuggestions (Phase 3)
    documents/
      accounts.test.ts     ← createAccount, deleteAccount guards, getAccountBalance (Phase 4)
      balance.test.ts
      balances.test.ts     ← ledger queries + finance reports Form 1/2/4 (Phase 4)
      journal.test.ts      ← autoPostDocument (Phase 1)
      posting-rules.test.ts ← buildPostingLines, resolvePostingAccounts (Phase 3)
      stock.test.ts
      stock-movements.integration.test.ts
  e2e/specs/
    ...
  setup.ts                 ← runs cleanDatabase() in beforeEach
```

**Naming rule:** one domain per file. Complex document flows (inventory_count, returns, etc.) get their own `tests/integration/api/<domain>.test.ts`.

---

## Two-Phase Confirm Architecture

`confirmDocumentTransactional` (critical path, fully awaited):
```
1. Load document + items
2. Validate (guards, stock availability)            → throws DocumentConfirmError on failure
3. createMovementsForDocument (affectsStock types)  → idempotent, own db calls
4. updateAverageCostForDocument                     → idempotent
5b. createInventoryAdjustments (inventory_count)    → creates write_off/stock_receipt linked docs
6. db.document.update → status: confirmed           ← only if all above succeed
```

`runPostConfirmEffects` (fire-and-forget, NOT awaited in route):
```
- recalculateBalance
- autoPostDocument  ← journal entries written here
- autoCreatePaymentForShipment
```

**Test implication:** Effects in `runPostConfirmEffects` are NOT guaranteed to complete before `CONFIRM()` returns. To test them, call `runPostConfirmEffects(id)` explicitly after the route call:
```typescript
import { runPostConfirmEffects } from '@/lib/modules/accounting/services/document-confirm.service'
await confirmDoc(doc.id)
await runPostConfirmEffects(doc.id)  // flush for assertion
const entries = await db.journalEntry.findMany({ where: { documentId: doc.id } })
```

---

## Known Pitfalls

### 1. Fire-and-forget breaks test assertions
`runPostConfirmEffects` is called without `await` in the route. Any test asserting journal entries, balance updates, or payments **after `CONFIRM()`** will see stale state unless `runPostConfirmEffects` is called explicitly.

### 2. `generateDocumentNumber` uses outer `db` inside interactive `$transaction`
In `createInventoryAdjustments`, `generateDocumentNumber("write_off")` uses the outer `db` client (not the `tx` handle) inside `db.$transaction(async (tx) => {...})`. This is the outer-client-inside-tx antipattern. Works under default `pg.Pool` (max: 10 connections) but will **deadlock** if pool is configured to `max: 1`.

### 3. `cleanDatabase()` deletes `documentCounter` rows
`cleanDatabase()` deletes all `DocumentCounter` rows in each `beforeEach`. `generateDocumentNumber` uses `upsert` so it re-creates them on demand — this is safe. But if a test manually seeds counters and expects them to persist across `beforeEach`, they won't.

### 4. `posting-rules.ts` had CRLF encoding — now fixed
File was CRLF-encoded causing `read_file` tool to report binary. Fixed by normalizing to LF. Now readable and tested (19 tests in `posting-rules.test.ts`).

### 5. Account codes are semi-static: `cleanDatabase()` does NOT delete accounts
Accounts survive `cleanDatabase()` — this is by design (see journal.test.ts `beforeAll` pattern). Tests that create accounts must either:
- Use `seedTestAccounts()` in `beforeAll`/`beforeEach` (upsert — safe for repeated runs)
- Use `ZZ.` prefix codes + `beforeAll(() => db.account.deleteMany({ where: { code: { startsWith: 'ZZ.' } } }))` for CRUD tests that specifically test account creation/deletion

### 6. Direct ledger line seeding pattern for balances.ts / finance reports
To test `getAccountBalance`, `getAccountTurnovers`, financial reports: seed `JournalEntry` + `LedgerLine` directly (no need to go through document confirmation flow):
```typescript
const db = getTestDb();
await db.journalEntry.create({
  data: {
    number: "JE-TEST-001", date: new Date("2025-06-01"), isReversed: false,
    lines: { create: [{ accountId: accountMap.get("41.1")!, debit: 1000, credit: 0 }] },
  },
});
```
JournalEntry.number must be `@unique` — use unique strings per test (e.g. include test-specific prefix).

---

## PR_POLICY

### Strictness mode: Mixed (Б)
- **BLOCK tier** — critical domains: merge is blocked when a required test type is absent or a critical invariant has no scenario coverage
- **WARN tier** — non-critical domains: PR proceeds with a gap note the author must consciously acknowledge

Blocking is **scenario-domain based, NOT percentage-based**. Qoder must never block solely because a coverage number is low.

---

### BLOCK Tier — Critical Domains

| File pattern | Domain | Required test type |
|---|---|---|
| `lib/modules/accounting/accounts.ts` | chart of accounts | integration |
| `lib/modules/accounting/balances.ts` | ledger queries | integration |
| `lib/modules/accounting/journal*.ts` | journal / autoPost | integration + fire-and-forget flush |
| `lib/modules/accounting/posting-rules*.ts` | posting rules | integration |
| `lib/modules/accounting/documents*.ts` | documents | integration |
| `lib/modules/accounting/stock*.ts` | stock movement | integration |
| `lib/modules/accounting/services/document-confirm*` | confirm/cancel flows | integration (route-level) |
| `lib/modules/finance/reports/**` | financial reports (Form 1/2/4) | integration + `seedReportAccounts()` |
| `app/api/accounting/documents/[id]/confirm/route.ts` | confirm flow | integration |
| `app/api/accounting/documents/[id]/cancel/route.ts` | cancel flow | integration |
| `app/api/accounting/inventory-count/**` | inventory_count | integration (domain-isolated) |

---

### WARN Tier — Non-Critical Domains

| File pattern | Domain | Action |
|---|---|---|
| `app/api/**` (non-accounting routes) | API route handlers | warn if untested |
| `app/(accounting)/**/*.tsx` | ERP UI pages | warn if untested |
| `app/store/**` | storefront / CMS | warn if untested |
| `components/**` | UI components | warn if untested |
| `lib/shared/**` | utilities / helpers | warn if untested |
| `prisma/**` | schema / migrations | warn only |

---

### Block Conditions

Qoder MUST block merge if **either** condition is true:

**Condition 1 — Missing required test type for critical domain:**
> PR touches a BLOCK tier file AND no integration test file exists for that domain,
> OR the only test is a unit test for a domain that explicitly requires integration coverage.

**Condition 2 — Critical invariant not covered by any scenario:**
> PR adds or modifies logic that encodes a domain invariant (guard, state machine transition,
> financial calculation, idempotency boundary) AND no test scenario verifies that invariant.

**Condition 3 — Domain behavior changed without a new scenario (semantic drift guard):**
> PR modifies the *behavior* of a BLOCK-tier domain — conditions, guards, filters, branching logic,
> or calculation rules — AND no **new** test scenario was added that specifically exercises the changed path.
>
> Passing existing tests does NOT satisfy this condition.
> Updating an existing test assertion to match new output does NOT satisfy this condition.
> A new `it(...)` block must exist that targets the changed behavior.

Domains with highest semantic drift risk (changes are frequent and subtle):
- `document-confirm.service.ts` — confirm/cancel chain conditions
- `posting-rules.ts` — account mappings per doc type and tax regime
- `stock-movements.ts` — quantity logic, reversal conditions
- `inventory_count` adjustment logic — shortage/surplus thresholds
- `lib/modules/finance/reports/**` — report formula changes

Qoder MUST ask: *“Did the behavior of this function change, or only its implementation?”*
If behavior changed → new scenario required. If pure refactor (same inputs/outputs) → existing tests sufficient.

Examples of critical invariants that MUST have scenario coverage:
- Stock quantity cannot go negative
- `confirmed` document cannot be re-confirmed (idempotency)
- `cancelled` document cannot be confirmed
- `deleteAccount`: guards for system account, has-children, has-ledger-entries
- Balance sheet `balanced = true` with non-zero data (non-graceful-zero assertion)
- Financial report fields must be asserted with concrete seeded values — zero-only assertions do NOT satisfy this condition
- Inventory adjustment creates linked write_off/stock_receipt document
- Reversing stock movements generated on cancel

---

### Fire-and-Forget Rule

If a PR touches any file that calls `runPostConfirmEffects` (or any other non-awaited async side effect):

1. **Unit tests alone are NOT sufficient** — the fire-and-forget path must be exercised at integration level
2. **The integration test MUST explicitly flush** the effect before asserting:
   ```typescript
   await confirmDoc(doc.id)              // route call
   await runPostConfirmEffects(doc.id)   // explicit flush — this is the correct test pattern
   const entries = await db.journalEntry.findMany(...)
   ```
3. Qoder MUST raise a BLOCK if the PR modifies a fire-and-forget flow and no integration test with flush exists

---

### Test-Type Decision Matrix

| Scenario | Required test type |
|---|---|
| Pure function — no DB, no I/O | unit only |
| Function that reads/writes DB via Prisma | integration |
| Next.js API route handler | integration (route-level) |
| Flow with fire-and-forget side effects | integration + explicit flush |
| State machine transition (document status) | integration |
| Financial report function | integration + `seedReportAccounts()` |
| UI component (React) | warn if absent; not required to block |
| Full user journey | e2e (optional until launch) |

---

### Audit Trigger Rules

Qoder MUST run a full domain audit and produce a gap report when:

1. PR touches any file matching a BLOCK tier pattern
2. PR adds a new module under `lib/modules/`
3. PR modifies `cleanDatabase()`, `seedTestAccounts()`, or `seedReportAccounts()`
4. PR modifies `prisma/schema.prisma`
5. PR modifies `document-confirm.service.ts` or `runPostConfirmEffects`

Qoder MUST NOT silently skip audit for changes to critical domains because the diff is small. Diff size is irrelevant to domain risk.

---

### Domain Isolation Rule

One domain per test file. Do not combine unrelated domains in a single test file to avoid:
- Cross-domain state pollution
- `beforeAll`/`beforeEach` assumption conflicts
- Fragile test ordering dependencies

Exception: `balances.test.ts` covers `balances.ts` + all three report modules because they share the same ledger-seeding infrastructure (`createEntry` helper + `seedReportAccounts`).

---

## Economic Scenario Facts

> Verified architectural facts discovered through cross-domain scenario testing.
> Qoder MUST apply these when generating or auditing tests for accounting domains.

---

### Fact 1 — `sales_order` does NOT move stock

`sales_order` is a commercial document. It does **not** trigger `createMovementsForDocument`.
Stock reduction on a customer sale happens through `outgoing_shipment`.

| Scenario | Correct document type | Incorrect (no stock effect) |
|---|---|---|
| Customer shipment / stock outflow | `outgoing_shipment` | `sales_order` |
| Purchase / stock inflow | `incoming_shipment` | `purchase_order` |

Document types that affect stock (from `stock-movements.ts`):
- **IN**: `stock_receipt`, `incoming_shipment`, `customer_return`
- **OUT**: `write_off`, `outgoing_shipment`, `supplier_return`
- **TRANSFER**: `stock_transfer`
- **ADJUSTMENT**: `write_off` / `stock_receipt` (created by `inventory_count`)

---

### Fact 2 — Zero `totalAmount` produces no journal entries

`buildPostingLines` (posting-rules.ts) filters out lines where `amount = 0`:
```typescript
return lines.filter((l) => l.amount > 0); // line 261-262
```

If `doc.totalAmount = 0`, all posting lines are filtered → `autoPostDocument` returns without
creating any `JournalEntry` records. **No error is raised — it silently skips posting.**

Consequence for tests: always set `totalAmount` before calling `autoPostDocument`, or ensure
the CONFIRM route has already computed it from items. The CONFIRM route does **not**
recalculate `totalAmount` automatically (see Fact 3).

Test pattern:
```typescript
// After CONFIRM, recalculate totalAmount from items before autoPostDocument
const items = await db.documentItem.findMany({ where: { documentId: docId } });
const totalAmount = items.reduce((s, i) => s + i.quantity * i.price, 0);
await db.document.update({ where: { id: docId }, data: { totalAmount } });
await autoPostDocument(docId, doc.number, doc.date);
```

---

### Fact 3 — CONFIRM route does not recalculate `totalAmount` from items

`confirmDocumentTransactional` does:
1. Validates document state
2. Creates stock movements (if `affectsStock(type)` is true)
3. Creates inventory adjustments (for `inventory_count`)
4. Sets `status = "confirmed"`

It does **not** recompute `totalAmount` from `DocumentItem` rows.
If the document was created with `totalAmount = 0` (factory default), it stays 0 after confirmation.

This means:
- Tests that call the CONFIRM route and then check journal entries must explicitly set `totalAmount`
- Production code that creates documents must ensure `totalAmount` is correct before confirmation
- A document with `totalAmount = 0` will confirm successfully but produce no journal entries

---

## Domain Mutation Checklist

> **This section is for Qoder only — not for PR authors.**
>
> When auditing a PR or generating a new test, Qoder MUST answer:
> *“What specific domain mutation does this test catch?”*
> If no concrete mutation can be named, the test is considered weak.
>
> When generating a test description (`it(...)`), prefer the form:
> `“fails if [dangerous mutation]”` or `“catches [specific wrong behavior]”`

### Mutation Priority

| Priority | Domains | Consequence of undetected bug |
|---|---|---|
| **CRITICAL** | journal, posting-rules, inventory_count | Silent financial misstatement; regulatory risk |
| **HIGH** | stock-movements, COGS, profit-loss | Incorrect P&L; inventory mismatch |
| **MEDIUM** | balance-sheet, cash-flow, accounts | Reporting inconsistency; CoA integrity |

When Qoder proposes a patch for a **CRITICAL** domain, mutation-specific assertions are **mandatory**.
For **HIGH** domains, at least one mutation-specific assertion per changed behavior path.
For **MEDIUM** domains, existing test quality is acceptable if double-entry and balanced invariants are already covered.

### Core Audit Principle

For BLOCK-tier domains, existence of a test is necessary but not sufficient.
The test must be **mutation-specific**: it must fail if a concrete, plausible business-logic error is introduced.

A test that only asserts `expect(result).toBeDefined()` or `expect(status).toBe(200)` does NOT satisfy mutation coverage.

---

### Mutation Table by Domain

#### journal / autoPostDocument

| Dangerous mutation | Must-fail test |
|---|---|
| Debit and credit lines swapped | `sum(debit lines) === sum(credit lines)` assertion on the entry |
| One ledger line silently dropped | Assert exact `lines.length`, not just `> 0` |
| Wrong account code in a line | Assert exact `accountId` (resolved from code) per line |
| Amount rounded only on debit side | Assert debit total === credit total to the cent |

Minimum assertion set for any journal entry test:
```typescript
expect(entry.lines).toHaveLength(N)          // exact count
const totalDebit  = entry.lines.reduce((s, l) => s + l.debit,  0)
const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
expect(totalDebit).toBe(totalCredit)          // double-entry invariant
expect(entry.lines[i].accountId).toBe(accountIds["XX.X"])  // exact account
```

---

#### posting-rules / buildPostingLines

| Dangerous mutation | Must-fail test |
|---|---|
| `incoming_shipment` posts to 62 instead of 60 | Assert credit account code === `"60"` |
| `sales_order` posts COGS to 60 instead of 90.2 | Assert debit account code === `"90.2"` |
| VAT line missing under ОСНО | Assert line with account `"19"` or `"68.02"` exists |
| Wrong tax regime branch taken | Assert account codes differ between ОСНО and УСН scenarios |

Rule: posting-rules tests must assert **account code by name**, not just that a line exists.

---

#### inventory_count adjustments

| Dangerous mutation | Must-fail test |
|---|---|
| Negative delta (shortage) creates `stock_receipt` instead of `write_off` | Assert linked doc type === `"write_off"` |
| Positive delta (surplus) creates `write_off` instead of `stock_receipt` | Assert linked doc type === `"stock_receipt"` |
| Delta sign flipped in calculation | Both shortage AND surplus scenarios must exist as independent `it(...)` blocks |
| `adjustmentsCreated` set even when delta = 0 | Assert no linked docs when `actualQty === expectedQty` |

Rule: shortage and surplus are separate invariants. One test covering only one path is insufficient.

---

#### stock-movements

| Dangerous mutation | Must-fail test |
|---|---|
| Cancel does not create reversing movement | Assert a movement with `isReversing: true` exists after cancel |
| Reversing movement has wrong quantity sign | Assert `reversing.quantity === -original.quantity` |
| Stock goes negative after cancel | `assertStockNonNegative()` after cancel scenario |
| Confirm creates movements twice (idempotency) | Confirm twice, assert movement count unchanged |

---

#### COGS / average cost

| Dangerous mutation | Must-fail test |
|---|---|
| Simple average used instead of weighted | Seed two receipts at different prices, assert weighted result |
| Incoming quantity ignored in denominator | Scenario: qty=10 at 100 + qty=5 at 200, assert avgCost = 133.33 |
| Cost updated on cancel (should not be) | Cancel a shipment, assert average cost reverts correctly |

---

#### finance/reports/profit-loss (Form 2)

| Dangerous mutation | Must-fail test |
|---|---|
| VAT on sales (90.3) excluded from netRevenue | Assert `netRevenue = revenue - vatOnSales`, not `revenue` alone |
| Income tax (68.04) not subtracted from netProfit | Assert `netProfit = profitBeforeTax - incomeTax` with seeded 68.04 |
| COGS debit/credit swapped | Seed 90.2 debit, assert `cogs > 0` (not 0) |
| sellingExpenses missing from operatingProfit | Assert `operatingProfit = grossProfit - sellingExpenses` explicitly |

Rule: assert **every intermediate field** (revenue, vatOnSales, netRevenue, cogs, grossProfit, sellingExpenses, operatingProfit, incomeTax, netProfit). A bug can hide inside a correct final total.

---

#### finance/reports/balance-sheet (Form 1)

| Dangerous mutation | Must-fail test |
|---|---|
| Passive accounts (equity/liabilities) not included in totalPassive | Seed Dr 51 / Cr 80, assert `balanced = true` with non-zero values |
| Inventory uses `41.1` instead of `41` | Seed account `41` (not `41.1`), assert `assets.current.inventory > 0` |
| Depreciation not subtracted from fixed assets | Seed Dr 01 + Cr 02, assert `fixedAssets = gross - depreciation` |
| Future entries counted | Seed entry with date > asOfDate, assert it does NOT appear |

Rule: `balanced = true` with **zero data** does NOT catch mutations. The balance equation test must use non-zero seeded values.

---

#### finance/reports/cash-flow (Form 4)

| Dangerous mutation | Must-fail test |
|---|---|
| Opening balance excluded from closingBalance | Seed pre-period entry, assert `closingBalance = openingBalance + netCashFlow` |
| Forex account (52) not included in totals | Seed account 52, assert `inflows.forex > 0` and included in `inflows.total` |
| Outflows and inflows swapped | Seed credit entry, assert it appears in `outflows`, not `inflows` |
| `balanced` flag always returns true | Seed mismatched data, confirm `balanced` correctly reflects arithmetic |

---

#### accounts / Chart of Accounts

| Dangerous mutation | Must-fail test |
|---|---|
| System account deleted without guard | `deleteAccount(systemAccount.id)` must throw, not silently succeed |
| Account with children deleted | `deleteAccount(parent.id)` must throw |
| Account with ledger entries deleted | Seed ledger line, then `deleteAccount` must throw |
| Duplicate code allowed | Create same code twice, second must throw with code in message |


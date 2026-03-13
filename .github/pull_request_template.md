## Description
<!-- What does this PR do and why? Be specific about the domain affected. -->

## Change Type
- [ ] Feature (new functionality)
- [ ] Fix (bug or regression)
- [ ] Refactor (no behavior change)
- [ ] Infrastructure / tooling / config
- [ ] Schema change (Prisma migration)

---

## Critical Domain Checklist

> **Policy reference:** `.qoder/skills/erp-test-guardian/reference.md` → `PR_POLICY`
> Merge is **blocked** if a BLOCK-tier domain is touched and a required item below is unchecked.
> Blocking is scenario-domain based — coverage % alone does not satisfy these conditions.

### Accounting / Ledger
`lib/modules/accounting/accounts.ts` · `balances.ts` · `journal*.ts` · `posting-rules*.ts` · `documents*.ts` · `stock*.ts`

- [ ] **Not applicable** — no accounting/ledger files modified
- [ ] Integration test added or updated for the affected accounting module
- [ ] All critical invariants for this module are covered by a concrete scenario (not zero-only assertions)
- [ ] `seedReportAccounts()` used if any finance report function (`lib/modules/finance/reports/**`) is touched

### Document Flows (confirm / cancel)
`services/document-confirm*` · `app/api/accounting/documents/[id]/confirm` · `.../cancel`

- [ ] **Not applicable** — no confirm/cancel flow files modified
- [ ] Integration test covers: confirm → expected DB state
- [ ] Integration test covers: cancel → reversed movements + `status: cancelled`
- [ ] Idempotency: calling confirm twice does not duplicate records (scenario tested)

### Stock Movement
`lib/modules/accounting/stock*.ts`

- [ ] **Not applicable** — no stock movement files modified
- [ ] Stock cannot go negative — scenario tested
- [ ] Reversing movements are generated on cancel — scenario tested

### Inventory Count
`app/api/accounting/inventory-count/**`

- [ ] **Not applicable** — no inventory_count files modified
- [ ] Integration test covers shortage → `write_off` linked doc created
- [ ] Integration test covers surplus → `stock_receipt` linked doc created
- [ ] `adjustmentsCreated = true` set after first confirm (idempotency guard tested)

---

## Semantic Drift Guard

> **Rule (Condition 3):** If this PR changes the *behavior* of a BLOCK-tier domain — conditions,
> guards, filters, branching logic, calculation rules — a **new** `it(...)` scenario must be added.
> Passing existing tests does not satisfy this. Updating existing assertions does not satisfy this.

Highest-risk files: `document-confirm.service.ts` · `posting-rules.ts` · `stock-movements.ts` · `inventory_count` logic · `finance/reports/**`

- [ ] This PR is a **pure refactor** — same inputs/outputs, no behavior change (existing tests sufficient)
- [ ] This PR **changes domain behavior** — a new `it(...)` scenario was added that specifically targets the changed path
- [ ] Not applicable — no BLOCK-tier domain behavior was modified

---

## Fire-and-Forget Side Effects

> **Rule:** If this PR touches any flow that calls `runPostConfirmEffects` (or any other
> non-awaited async side effect), a unit/service test alone is NOT sufficient.

- [ ] This PR does **not** touch any fire-and-forget flow
- [ ] This PR **does** touch a fire-and-forget flow — the integration test explicitly flushes the effect:
  ```typescript
  await confirmDoc(doc.id)
  await runPostConfirmEffects(doc.id)  // explicit flush before asserting
  const entries = await db.journalEntry.findMany(...)
  ```

---

## Test Summary

| Test type   | Before | After |
|-------------|--------|-------|
| Unit        |        |       |
| Integration |        |       |
| E2E         |        |       |

- [ ] `npm run test:unit` passes locally
- [ ] `npm run test:integration` passes locally
- [ ] No existing tests were deleted or commented out to make the suite pass

---

## Qoder Audit

> Required when PR touches any BLOCK-tier domain, adds a new `lib/modules/` module,
> modifies `cleanDatabase` / `seedTestAccounts` / `seedReportAccounts`, or modifies `schema.prisma`.

- [ ] Qoder audit **not required** — no BLOCK-tier files modified
- [ ] Qoder audit **completed** — no gaps found
- [ ] Qoder audit **completed** — gaps noted and accepted as intentionally deferred:

<!-- List any deferred gaps with justification -->

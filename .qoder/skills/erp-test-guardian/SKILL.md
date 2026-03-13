---
name: erp-test-guardian
description: AI Test Guardian for ERP projects. Audits test coverage of critical domains (stock, warehouse, documents, stock-movements, inventory_count, journal), detects gaps, builds a test roadmap, and generates ready-to-apply test files. Use when: reviewing PRs, analysing changed files for missing tests, setting up test infrastructure, or when the user asks to audit tests, check coverage, find missing tests, or protect domain logic from regressions.
---

# ERP Test Guardian

Protect critical ERP domain logic from regressions by auditing test coverage and generating concrete test roadmaps and patches.

> **Output language:** All summaries, coverage maps, roadmaps, and recommendations must be written in **Russian**. Code, file paths, and identifiers remain in English.

## Workflow

Run all three phases in order. Always complete Phase 1 before generating output.

### Phase 1 — Project Audit (first run only)

Gather the following in parallel:

1. `package.json` — test scripts, framework (Jest / Vitest), coverage tool
2. `prisma/schema.prisma` — domain entities
3. Existing test files — `tests/**/*.test.ts`, `tests/**/*.spec.ts`
4. Service files — `lib/modules/**/*.ts`
5. CI config — `.github/workflows/*.yml`

Build a **Coverage Map**:

```
Domain           | Unit | Service | Integration | E2E | Risk
-----------------|------|---------|-------------|-----|------
stock-movement   |  ✓   |    ✗    |      ✗      |  ✗  | HIGH
warehouse        |  ✗   |    ✗    |      ✗      |  ✗  | HIGH
documents        |  ✓   |    ✓    |      ✗      |  ✗  | MED
```

### Phase 2 — PR / Commit Audit

When files change, determine:

1. **Domain impact** — does the change touch a critical domain? (see [reference.md](reference.md))
2. **Existing coverage** — search for test files covering changed services/modules
3. **Gap analysis** — which required scenarios are missing?
4. **Risk level** — HIGH / MED / LOW based on domain tier

### Phase 3 — Output Report

Always return exactly three blocks:

#### SUMMARY
```
PR affects critical domain: <domain>
Risk level: HIGH | MED | LOW

Missing coverage:
- <scenario 1>
- <scenario 2>
```

#### ROADMAP
```
1. Service tests
   File: tests/unit/lib/<domain>.test.ts
   Scenarios:
   - <scenario>

2. Integration tests
   File: tests/integration/<domain>.test.ts
   Scenarios:
   - <scenario>

3. E2E smoke (if needed)
   File: tests/e2e/specs/<domain>.spec.ts
   Scenarios:
   - <scenario>
```

#### PATCH
List files to create/update. Then generate each file immediately.

---

## Test Pyramid Rules

| Layer       | Purpose                                                     | Required for critical domains |
|-------------|-------------------------------------------------------------|-------------------------------|
| Unit        | Pure functions, helpers, math — NO DB access               | Optional                      |
| Integration | DB state, route handlers, confirm/cancel flows, constraints | **Mandatory**                 |
| E2E         | Key API flows only (confirm, cancel, stock)                 | Smoke only                    |

> There is no separate "Service" layer in this project. Business logic that touches Prisma lives in `lib/modules/accounting/services/` and is tested at the Integration level using real DB + route handlers.

---

## Critical Scenarios Checklist

For every **critical domain** service, always check these scenarios exist:

- [ ] Happy path creates expected records
- [ ] Duplicate/idempotent call does NOT create duplicates
- [ ] Cancel/reversal creates reversing movement and restores stock
- [ ] Stock invariant: quantity never goes negative
- [ ] Transaction rollback on error leaves no partial state
- [ ] Unique constraint violation is handled gracefully

**For `inventory_count` specifically:**
- [ ] shortage → `write_off` linked doc created, `adjustmentsCreated = true`
- [ ] surplus → `stock_receipt` linked doc created, `adjustmentsCreated = true`
- [ ] no discrepancies → no adjustment docs, flag stays `false`
- [ ] `delta = actualQty − expectedQty` correctly signed
- [ ] `write_off` movements have negative qty, `stock_receipt` positive
- [ ] cancel does NOT create reversing StockMovements (`affectsStock = false`)
- [ ] cancel does NOT cascade-cancel linked adjustment docs

---

## Domain Isolation Rule

Complex document flows get their **own dedicated test file**. Do NOT extend `documents.test.ts` with scenarios from a different document type.

Mapping:
```
tests/integration/api/documents.test.ts        → generic stock_receipt, write_off confirm/cancel
tests/integration/api/inventory-count.test.ts  → inventory_count full domain suite
tests/integration/api/<next-domain>.test.ts    → next complex flow
```

Rule of thumb: if the flow creates additional linked documents, manages its own flags (`adjustmentsCreated`, etc.), or has semantics not shared by other doc types — it gets its own file.

---

## Fire-and-Forget Warning

`runPostConfirmEffects(id)` is called without `await` in the route handler. This means:
- Journal entries
- Balance recalculation  
- Auto-payments

...are **NOT guaranteed to exist** immediately after a `CONFIRM()` call in tests.

To assert these effects, call the function explicitly:
```typescript
await runPostConfirmEffects(doc.id)
const entries = await db.journalEntry.findMany({ where: { ... } })
```

Never assert fire-and-forget effects without this explicit flush.

---

## Constraints

**Allowed without approval:**
- Create test files (`tests/**`)
- Create/update test helpers (`tests/helpers/`)
- Create factories/fixtures (`tests/helpers/factories.ts`)
- Update test scripts in `package.json`
- Update vitest/jest config

**Requires user approval:**
- Any change to `lib/modules/**` (production code)
- Any change to `prisma/schema.prisma`
- Any change to `app/api/**`

If a test is impossible without a production refactor → state the problem, propose the minimal refactor, wait for approval before proceeding.

---

## Generated File Templates

See [reference.md](reference.md) for full templates:
- Service test template
- Integration test template
- Stock assertions helper
- Idempotency assertions helper
- DB factory pattern

## Output Examples

See [examples.md](examples.md) for concrete audit outputs.

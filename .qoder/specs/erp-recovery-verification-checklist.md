# ERP Recovery Program — Verification Checklist

**Document Status:** ACTIVE — VERIFICATION DOCUMENT  
**Authority:** Required for phase sign-off and program completion  
**Governed By:** `.qoder/specs/erp-recovery-roadmap.md`  
**Execution Reference:** `.qoder/specs/erp-recovery-execution-plan.md`  

---

## 1. Purpose

This checklist is the formal verification instrument for the ERP Recovery Program. It is used at the end of each recovery phase to confirm phase completion, and at the end of the program to confirm full program completion.

It is not a planning document. It does not define tasks. It verifies that tasks defined in the roadmap and execution plan have been completed correctly and that the system state matches the expected outcomes.

A phase may not be signed off and a transition to the next phase may not begin unless every required item in the corresponding checklist section is answered YES with recorded evidence.

---

## 2. Verification Rules

1. **Every line item must be answered YES or NO.** Partial answers, "in progress", and "mostly yes" are treated as NO.

2. **Every YES must have evidence.** Evidence must be concrete: command output, file path, test run result, grep/search result, or CI run result. Narrative description without concrete evidence is not acceptable.

3. **A phase is not complete if any required line item is NO.** There are no optional items. A single NO blocks phase sign-off.

4. **Evidence must be recorded at the time of verification.** Evidence collected after sign-off is not valid. Do not sign off first and verify later.

5. **Checklist completion is required before phase transition.** No phase may begin until the preceding phase's checklist is fully signed off with all evidence recorded.

6. **Checklist items are binary.** A check either passes or it does not. Conditions that are "almost" met are not met.

---

## 3. R1 Verification Checklist — Tenant Isolation Lockdown

**Sign-off gate:** All items must be YES before R2 begins.

---

### Products Handlers

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 1.1 | `GET /api/accounting/products` applies `tenantId` filter in `where` clause | Code review: `tenantId: session.tenantId` present in query; cross-tenant request returns empty list |
| 1.2 | `GET /api/accounting/products/[id]` returns 404 for another tenant's product | Manual test or integration run: HTTP 404 on cross-tenant ID |
| 1.3 | `PUT /api/accounting/products/[id]` returns 404 for another tenant's product | Manual test or integration run: HTTP 404 on cross-tenant PUT |
| 1.4 | `DELETE /api/accounting/products/[id]` returns 404 for another tenant's product | Manual test or integration run: HTTP 404 on cross-tenant DELETE |

---

### Documents Handlers

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 2.1 | `GET /api/accounting/documents` applies `tenantId` filter in `where` clause | Code review: predicate present; cross-tenant request returns empty list |
| 2.2 | `GET /api/accounting/documents/[id]` returns 404 for another tenant's document | HTTP 404 on cross-tenant ID |
| 2.3 | `PUT /api/accounting/documents/[id]` returns 404 for another tenant's document | HTTP 404 on cross-tenant PUT |
| 2.4 | `DELETE /api/accounting/documents/[id]` returns 404 for another tenant's document | HTTP 404 on cross-tenant DELETE |

---

### Document Confirm / Cancel Tenant Propagation

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 3.1 | `POST /api/accounting/documents/[id]/confirm` returns 404 for another tenant's document | HTTP 404; no partial state transition occurs |
| 3.2 | `confirmDocumentTransactional()` accepts and verifies `tenantId` parameter | Code review: function signature includes `tenantId`; ownership check executes before state transition |
| 3.3 | `POST /api/accounting/documents/[id]/cancel` returns 404 for another tenant's document | HTTP 404 on cross-tenant cancel |
| 3.4 | `cancelDocumentTransactional()` accepts and verifies `tenantId` parameter | Code review: function signature includes `tenantId`; ownership check present |

---

### Counterparties Handlers

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 4.1 | `GET /api/accounting/counterparties` applies `tenantId` filter | Code review: predicate present; cross-tenant request returns empty list |
| 4.2 | `GET /api/accounting/counterparties/[id]` returns 404 for another tenant's counterparty | HTTP 404 on cross-tenant ID |
| 4.3 | `PUT /api/accounting/counterparties/[id]` returns 404 for another tenant's counterparty | HTTP 404 on cross-tenant PUT |
| 4.4 | `DELETE /api/accounting/counterparties/[id]` returns 404 for another tenant's counterparty | HTTP 404 on cross-tenant DELETE |

---

### Finance Payments

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 5.1 | `GET /api/finance/payments` either applies `tenantId` filter OR task R1-13 is formally BLOCKED with recorded reason | Filter applied and verified — OR — blocker record exists with file reference and deferred status |

---

### Integration Suite

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 6.1 | `npm run test:integration` passes after all R1 changes | Test run output: pass count, zero failures, zero skipped unexpectedly |
| 6.2 | No regression introduced by R1 changes | Test counts before and after R1 are consistent; no previously passing test now fails |

---

### Cross-Tenant Access Summary

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 7.1 | No in-scope handler returns data from a tenant other than `session.tenantId` | Code review across all modified handlers confirms `tenantId` predicate or ownership check present |

---

**R1 Sign-Off:**  
Date: ___________  All items YES: ☐  Signed by: ___________

---

## 4. R2 Verification Checklist — Migration Governance Recovery

**Sign-off gate:** All items must be YES before R3 begins.

---

### Migration File Inventory

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 8.1 | All 12 migration files in `prisma/migrations/` have been enumerated and verified | Ordered list of 12 migration directory names; each confirmed against current `schema.prisma` |
| 8.2 | No migration file content contradicts the current database schema | Per-migration review notes or summary confirming content alignment |

---

### Baseline Establishment

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 9.1 | `_prisma_migrations` table exists in the development database | `SELECT COUNT(*) FROM "_prisma_migrations"` returns a non-zero integer |
| 9.2 | `_prisma_migrations` contains the correct number of rows | Row count matches the total number of resolved migrations |
| 9.3 | `prisma migrate status` reports zero pending migrations | Command output: "All migrations have been applied" or equivalent; zero pending |
| 9.4 | `prisma generate` runs without errors after baseline | Command exits 0; no error output |

---

### Missing Migration Files

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 10.1 | Migration file for `Product.tenantId` exists in `prisma/migrations/` | File path in `prisma/migrations/` confirmed; filename contains `product` and `tenant` identifier |
| 10.2 | Migration file for `Document.tenantId` exists in `prisma/migrations/` | File path in `prisma/migrations/` confirmed; filename contains `document` and `tenant` identifier |
| 10.3 | Both new migration files are safe to apply on a database where the columns already exist | SQL content review: uses `IF NOT EXISTS` or equivalent idempotency guard |
| 10.4 | Both new migrations are marked as applied in `_prisma_migrations` | `prisma migrate status` shows them as applied; row exists in table |

---

### Verification Gates

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 11.1 | `verify-product-tenant-gate.ts` exits with code 0 | Script execution output: exit code 0; no NULL tenantId rows reported |
| 11.2 | `verify-document-tenant-gate.ts` exits with code 0 | Script execution output: exit code 0 |
| 11.3 | `verify-counterparty-tenant-gate.ts` exits with code 0 | Script execution output: exit code 0 |

---

### Rollback Documentation

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 12.1 | Rollback procedure document exists in `.qoder/specs/` | File path confirmed; document addresses Warehouse, Counterparty, Product, Document migrations |

---

**R2 Sign-Off:**  
Date: ___________  All items YES: ☐  Signed by: ___________

---

## 5. R3 Verification Checklist — Tenant Test Shield

**Sign-off gate:** All items must be YES before R4 begins.

---

### Test File Existence

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 13.1 | `tests/integration/api/tenant-isolation/` directory exists | Directory path confirmed |
| 13.2 | `tests/integration/api/tenant-isolation/products.test.ts` exists | File path confirmed |
| 13.3 | `tests/integration/api/tenant-isolation/documents.test.ts` exists | File path confirmed |
| 13.4 | `tests/integration/api/tenant-isolation/counterparties.test.ts` exists | File path confirmed |
| 13.5 | `tests/integration/migration-gates.test.ts` exists | File path confirmed |

---

### Products Isolation Coverage

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 14.1 | GET list isolation test passes (Tenant A cannot see Tenant B's products) | Test output: scenario passes; uses two distinct tenants |
| 14.2 | GET by ID cross-tenant 404 test passes | Test output: pass |
| 14.3 | PUT cross-tenant 404 test passes | Test output: pass |
| 14.4 | DELETE cross-tenant 404 test passes | Test output: pass |

---

### Documents Isolation Coverage

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 15.1 | GET list isolation test passes | Test output: pass; two tenants used |
| 15.2 | GET by ID cross-tenant 404 test passes | Test output: pass |
| 15.3 | PUT cross-tenant 404 test passes | Test output: pass |
| 15.4 | DELETE cross-tenant 404 test passes | Test output: pass |
| 15.5 | Confirm cross-tenant 404 test passes | Test output: pass; no state transition occurs |
| 15.6 | Cancel cross-tenant 404 test passes | Test output: pass |

---

### Counterparties Isolation Coverage

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 16.1 | GET list isolation test passes | Test output: pass; two tenants used |
| 16.2 | GET by ID cross-tenant 404 test passes | Test output: pass |
| 16.3 | PUT cross-tenant 404 test passes | Test output: pass |
| 16.4 | DELETE cross-tenant 404 test passes | Test output: pass |

---

### Migration Gate Automated Tests

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 17.1 | Gate exits 1 on NULL `Product.tenantId` test passes | Test output: pass; gate returned exit code 1 as expected |
| 17.2 | Gate exits 1 on NULL `Document.tenantId` test passes | Test output: pass |
| 17.3 | Gate exits 1 on NULL `Counterparty.tenantId` test passes | Test output: pass |
| 17.4 | All three gates exit 0 on clean data test passes | Test output: pass |

---

### Minimum Coverage Count

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 18.1 | Total tenant isolation integration tests ≥ 14 | Test runner output: count of tests in `tenant-isolation/` directory ≥ 14 |

---

### CI Gate Integration

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 19.1 | CI gate step exists in `.github/workflows/` or as `package.json` script | File path or script name confirmed |
| 19.2 | CI gate step fails when NULL tenantId is present | Simulated run or test: step exits non-zero with NULL injected |
| 19.3 | CI gate step passes when data is clean | Run result: step exits 0 with no NULL rows |

---

### Full Suite

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 20.1 | `npm run test:integration` passes entirely with all new tests included | Test run output: all tests pass; total count reflects new files |

---

**R3 Sign-Off:**  
Date: ___________  All items YES: ☐  Signed by: ___________

---

## 6. R4 Verification Checklist — Minimal Architecture Cleanup

**Sign-off gate:** All items must be YES before Program Completion Checklist is run.

---

### CompanySettings Elimination

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 21.1 | R4-01 audit inventory exists | Working artifact: list of files and functions that read `CompanySettings`, produced during R4-01 |
| 21.2 | Zero `CompanySettings` reads remain in `lib/modules/accounting/` | Grep result: search for `CompanySettings` in `lib/modules/accounting/` returns zero matches in active code |
| 21.3 | Zero `seedCompanySettings` calls remain in test infrastructure | Grep result: search for `seedCompanySettings` across all test files returns zero matches |
| 21.4 | Tests that previously called `seedCompanySettings()` now use the `TenantSettings`-based equivalent and pass | Test run output: all previously passing tests still pass |

---

### DocumentConfirmedEvent Tenant Payload

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 22.1 | `DocumentConfirmedEvent` payload interface includes `tenantId: string` as a required field | Code review of `lib/events/types.ts`: `tenantId` is present and required (not optional) |
| 22.2 | `createOutboxEvent` call in `document-confirm.service.ts` supplies `tenantId` in payload | Code review: `tenantId` sourced from document record and included in event payload object |
| 22.3 | No TypeScript compile errors after R4-04 and R4-05 changes | `npx tsc --noEmit` exits 0; output is empty |

---

### Test Factory Review

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 23.1 | Test factory silent tenant creation review is complete | Review outcome recorded: either (A) factories corrected with explanation, or (B) factories confirmed safe with written justification |
| 23.2 | R3 tenant isolation tests still pass after factory changes (if any) | Test run output: all R3 tests pass |

---

### Full Suite

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 24.1 | `npm run test:integration` passes entirely after all R4 changes | Test run output: all tests pass; no regressions |

---

**R4 Sign-Off:**  
Date: ___________  All items YES: ☐  Signed by: ___________

---

## 7. Program Completion Checklist

**Sign-off gate:** All items must be YES for the Recovery Program to be declared complete and the system eligible for Phase 5 planning.

---

### Phase Completion Confirmation

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 25.1 | R1 checklist is fully signed off | R1 Sign-Off date and signature recorded in this document |
| 25.2 | R2 checklist is fully signed off | R2 Sign-Off date and signature recorded |
| 25.3 | R3 checklist is fully signed off | R3 Sign-Off date and signature recorded |
| 25.4 | R4 checklist is fully signed off | R4 Sign-Off date and signature recorded |

---

### Roadmap Program Completion Criteria (Section D)

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 26.1 | All R1 tasks passed their Done Criteria | R1 checklist sign-off |
| 26.2 | All R2 tasks passed their Done Criteria | R2 checklist sign-off |
| 26.3 | All R3 tasks passed their Done Criteria | R3 checklist sign-off |
| 26.4 | All R4 tasks passed their Done Criteria | R4 checklist sign-off |
| 26.5 | `prisma migrate status` reports zero pending migrations | Final command run output: zero pending |
| 26.6 | `npm run test:integration` passes with all tenant isolation tests green | Final test run output: all tests pass, tenant isolation count ≥ 14 |
| 26.7 | All three verification gate scripts exit code 0 | Final gate execution output: exit code 0 for all three |
| 26.8 | `CompanySettings` is no longer referenced by any active code path | Grep result: zero matches in `lib/` and `app/` directories |
| 26.9 | `DocumentConfirmedEvent` payload includes explicit `tenantId` | Code review of `lib/events/types.ts` and `document-confirm.service.ts` |
| 26.10 | No critical or high risks from the audit baseline remain unresolved | Review against audit baseline Section 9 risk table: all CRITICAL and HIGH items addressed |

---

### Final Verification Commands

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 27.1 | `prisma migrate status` exits 0 with zero pending | Command output recorded |
| 27.2 | `npx tsc --noEmit` exits 0 | Command exits 0; output is empty |
| 27.3 | `npm run test:integration` exits 0 | Test runner exits 0; all tests pass |
| 27.4 | `verify-product-tenant-gate.ts` exits 0 | Exit code 0 confirmed |
| 27.5 | `verify-document-tenant-gate.ts` exits 0 | Exit code 0 confirmed |
| 27.6 | `verify-counterparty-tenant-gate.ts` exits 0 | Exit code 0 confirmed |

---

### Phase 5 Eligibility

| # | Check | Expected Evidence |
|---|-------|-------------------|
| 28.1 | All 27 checks above are YES with evidence recorded | This document fully completed |
| 28.2 | No Execution Stop Rule is in an active triggered state | Execution plan reviewed: no open STOP conditions |
| 28.3 | Deferred work from roadmap Section E is recorded and not mixed into the completed scope | Deferred items list in roadmap confirmed unchanged |

---

**Program Completion Sign-Off:**  
Date: ___________  All items YES: ☐  Signed by: ___________

System eligible for Phase 5 planning: ☐ YES  ☐ NO

---

## 8. Recommended Evidence Format

Evidence must be short, concrete, and recorded at the time of verification. The following formats are accepted.

**Command output summary**  
Record the command, exit code, and the relevant output line. Example: `prisma migrate status` → exit 0 → "All migrations have been applied."

**File path**  
Absolute or repo-relative path confirming the file exists. Example: `tests/integration/api/tenant-isolation/products.test.ts` confirmed present.

**Grep / search result**  
The search pattern, scope, and result count. Example: grep `CompanySettings` in `lib/modules/accounting/` → 0 matches.

**Test count**  
Total tests, pass count, fail count from the test runner output. Example: `npm run test:integration` → 326 passed, 0 failed.

**CI run result**  
CI step name, run ID or timestamp, and pass/fail outcome. Example: `verify-gates` step → run #47 → passed.

**Code review note**  
File name, function name, and what was confirmed. Example: `products/route.ts` GET handler — `tenantId: session.tenantId` present in `where` clause.

Evidence that does not fall into one of these formats must be accompanied by a brief explanation of why it is sufficient.

---

*End of ERP Recovery Verification Checklist*

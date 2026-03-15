# ERP Recovery Program — Architecture Guardrails

**Document Status:** ACTIVE — GOVERNING DOCUMENT  
**Authority:** Applies to all work performed under the ERP Recovery Program  
**Governed By:** `.qoder/specs/erp-recovery-roadmap.md`  
**Baseline Reference:** `.qoder/specs/erp-recovery-audit-baseline.md`  

---

## 1. Purpose

The ERP Recovery Program is a controlled stabilization track. Its scope is fixed. Its problem inventory is frozen in the audit baseline. Its execution order is fixed in the roadmap.

Guardrails exist for a specific reason: stabilization work is at high risk of scope drift, incidental refactoring, and well-intentioned changes that move risk rather than eliminate it. Every recovery phase touches live production code paths. Every change made outside confirmed scope introduces unpredicted side effects.

This document defines the non-negotiable constraints, invariants, and decision rules that all Recovery contributors must follow. These rules are not advisory. A change that violates a guardrail is not eligible for merge regardless of whether tests pass.

---

## 2. Recovery Operating Principles

These principles govern every decision made during Recovery work.

**P-01: Stabilize before expanding.**  
No feature work, no new modules, no new API endpoints may be introduced during any Recovery phase. The system's functional surface must not grow while structural gaps remain open.

**P-02: Fix only confirmed gaps.**  
The problem inventory is defined in the audit baseline. Work is limited to closing confirmed gaps. Suspected issues, observed code smells, and optimization opportunities that are not in the baseline are not eligible for Recovery scope.

**P-03: Prefer narrow corrections over broad rewrites.**  
A change that fixes one handler is safer than a change that refactors a shared utility used by ten handlers. Narrow changes produce predictable blast radius. Rewrites do not.

**P-04: Preserve working architecture unless explicitly in scope.**  
If a module, file, or function is not named in the roadmap, it must not be modified. "While I'm here" changes are forbidden. The working state of unaffected code is a program asset that must be protected.

**P-05: Every fix must reduce system risk, not relocate it.**  
A change that closes a tenant isolation gap in one handler but introduces an unverified assumption in another handler has not reduced risk — it has moved it. Fixes must be self-contained and verifiable.

**P-06: The audit baseline is the source of truth for scope.**  
If something is not in the baseline, it is not a Recovery problem. If something is in the baseline but not in the current phase's scope, it belongs to a future phase or is deferred. The baseline is frozen and may not be retroactively expanded to justify out-of-scope work.

---

## 3. Tenant Isolation Invariants

These invariants define what it means for code to be tenant-safe. Any code path that violates these invariants is non-compliant and must not be merged.

**INV-T-01: Every tenant-scoped read must include tenant scoping.**  
Any database read on a tenant-scoped entity (`Product`, `Document`, `Counterparty`, `Warehouse`) must include a `tenantId` predicate derived from the authenticated session. A read that returns records from multiple tenants is a violation regardless of whether downstream code filters the results.

**INV-T-02: Every by-ID mutation must verify tenant ownership before executing.**  
A `findUnique`, `update`, or `delete` query that uses only an entity ID without a `tenantId` constraint is a violation. Ownership verification must happen at the query level, not as a post-query check. If the entity does not belong to the current tenant, the response must be 404, not 403. ID enumeration must not be exploitable.

**INV-T-03: Service-layer operations that mutate business state must receive tenant context.**  
When a service function performs a state transition on a tenant-scoped entity (confirm, cancel, stock movement, balance recalculation), the `tenantId` of the requesting tenant must be passed explicitly as a parameter. Service functions must not infer tenant context from the entity's stored `tenantId` alone when the operation originates from an API request.

**INV-T-04: No handler may rely on ID secrecy as a security boundary.**  
UUIDs are not secrets. The assumption that "an attacker cannot guess the ID" is not an acceptable substitute for tenant ownership verification. Every handler must enforce ownership independently of ID opacity.

**INV-T-05: No authenticated request may read or mutate another tenant's records.**  
This is the top-level invariant. INV-T-01 through INV-T-04 are enforcement mechanisms for this rule. A system where any combination of valid authentication + valid request format produces cross-tenant data access is in violation.

---

## 4. Migration Governance Invariants

These invariants define the minimum standards for schema change discipline. Violations here produce deploy failures, unrecoverable schema states, and unauditable production history.

**INV-M-01: `prisma db push` is forbidden outside disposable local development.**  
`db push` may be used only in ephemeral development environments (e.g., local scratch databases) where schema state does not matter. It is forbidden in any environment whose schema is expected to persist — including development databases used for integration testing, staging, and production. Violation of this rule produces exactly the governance failure documented in the audit baseline.

**INV-M-02: All production and staging schema changes must flow through managed migrations.**  
`prisma migrate deploy` is the only permitted mechanism for schema changes outside disposable environments. A schema change that is not represented by a migration file in `prisma/migrations/` does not officially exist.

**INV-M-03: `_prisma_migrations` must remain authoritative after R2 completion.**  
Once the R2 baseline is established, the `_prisma_migrations` table becomes the authoritative record of schema history. No schema change may bypass this table. Running `prisma db push` on a development database after R2 completion invalidates the governance baseline and requires R2 to be re-executed.

**INV-M-04: No schema change is complete without migration file provenance.**  
A column that exists in the database but has no corresponding migration file is undocumented schema. This applies retroactively to `Product.tenantId` and `Document.tenantId`, which R2 is required to correct. After R2, no new column, index, constraint, or table may be added without a corresponding migration file.

**INV-M-05: No migration may be introduced without rollback consideration.**  
Every migration file created during R2 must be accompanied by a documented assessment of what rollback would require. Rollback may not always be possible (e.g., NOT NULL constraints with existing data), but the consequence must be recorded. Undocumented one-way migrations are a deploy risk.

**INV-M-06: Verification gate scripts are deploy blockers once integrated into CI.**  
After R3 integrates the gate scripts into the automated pipeline, a gate script that exits non-zero must prevent deploy. Gate results are not advisory. A deploy that proceeds past a failing gate has violated migration governance.

---

## 5. Test Shield Invariants

These invariants define the minimum standards for tenant isolation test coverage during and after the Recovery Program.

**INV-TS-01: Every confirmed tenant isolation bug must result in regression coverage.**  
For each gap confirmed in the audit baseline (sections 5.1 through 5.4), a corresponding test must exist that would have detected that gap. The test must fail before the R1 fix is applied and pass after. Coverage that only tests post-fix behavior does not constitute regression coverage.

**INV-TS-02: Cross-tenant scenarios must use at least two real tenants.**  
A test that creates data in a single tenant and verifies it is returned correctly is a single-tenant test. It does not verify tenant isolation. Cross-tenant tests must create entities under two distinct tenants and verify that the requesting tenant's session cannot access the other tenant's data.

**INV-TS-03: Passing single-tenant happy-path tests is not evidence of tenant safety.**  
The absence of cross-tenant test failures in a suite that contains no cross-tenant tests is not a passing signal. A green test suite with zero tenant isolation tests does not demonstrate that tenant isolation is functioning. This condition is explicitly what the Recovery Program exists to correct.

**INV-TS-04: Verification gates must have automated execution.**  
A verification gate script that exists only as a manual CLI utility provides no continuous protection. After R3, all three gate scripts must be executed automatically as part of CI. Manual execution results are not acceptable as gate evidence for deploy decisions.

---

## 6. Transitional Pattern Rules

These rules define how the active transitional architecture patterns identified in the audit baseline must be treated during Recovery.

**TR-01: Acceptable shims may remain if they are explicitly documented and low-risk.**  
The `documents.ts` backward-compatibility shim is classified as low-risk in the audit baseline (section 8.1). It may remain active during the Recovery Program without modification. It is deferred to Phase 5. A shim is acceptable if it is a pure re-export, carries no hidden state, and has no behavioral divergence from its target.

**TR-02: Dangerous parallel systems must converge to a single source of truth within scope.**  
The `CompanySettings` / `TenantSettings` parallel system is classified as dangerous in the audit baseline (section 8.2). R4 must resolve it by redirecting all active reads to `TenantSettings`. Convergence means one source. It does not mean deleting the legacy table during Recovery — schema cleanup is deferred. It means no active code path reads from the legacy table after R4.

**TR-03: A transitional pattern without a documented retirement intent is not acceptable.**  
If a pattern exists in the codebase that behaves differently from the intended architecture, and there is no documented plan for its removal, it is a permanent divergence, not a transitional pattern. Recovery contributors must not introduce new patterns of this type.

**TR-04: Pattern cleanup is limited to patterns identified in the audit baseline.**  
Recovery contributors may not expand cleanup scope to patterns they observe during work. If a new dangerous pattern is discovered during Recovery execution, it is escalated using the Phase Escalation Rule (section 9) — not immediately fixed.

---

## 7. Change Boundaries

This section defines explicitly what Recovery contributors may and may not do. These boundaries are enforceable at PR review.

### Permitted During Recovery

- Adding `tenantId` predicates to existing Prisma query `where` clauses in confirmed-gap handlers
- Passing `tenantId` as an explicit parameter to service functions that are named in roadmap tasks
- Creating new integration test files in the tenant isolation test directory
- Creating missing migration provenance files for `Product.tenantId` and `Document.tenantId`
- Running `prisma migrate resolve --applied` to establish the migration baseline
- Adding `tenantId` field to `DocumentConfirmedEvent` payload and updating its emission site
- Updating test factories to use `TenantSettings` in place of `CompanySettings` where required by R4
- Creating the R2 rollback procedure document

### Forbidden During Recovery

- Redesigning module boundaries or splitting existing modules
- Introducing new user-facing features or API endpoints
- Adding schema columns, tables, or indexes not required for confirmed gap resolution
- Modifying handlers, services, or utilities that are not named in roadmap tasks
- Performing "opportunistic" refactoring of adjacent code encountered during task execution
- Changing authentication or session architecture
- Modifying the document state machine beyond what is required by roadmap tasks
- Adding new domain events beyond the `DocumentConfirmedEvent` tenant payload addition
- Introducing new dependencies (npm packages, external services)
- Running `prisma db push` on any non-disposable database after R2

---

## 8. Review Checklist

Reviewers must evaluate each Recovery PR against the following questions. Each question has a binary answer. A "No" on any question is a blocker for merge.

**Scope Compliance**
- Does this change close a gap that is explicitly confirmed in the audit baseline?
- Does the change reference a specific roadmap task ID in the PR description?
- Does the change avoid modifying files not named in the referenced task's target area?

**Tenant Safety**
- Does this change enforce `tenantId` scoping at the query level, not at the result level?
- Does every by-ID operation in modified handlers now verify tenant ownership before mutating?
- Is it impossible for this change, in production, to return data belonging to a different tenant?

**Migration Discipline**
- Does this change avoid running `prisma db push` on any non-disposable environment?
- If a schema file was modified, does a corresponding migration file exist or is one being created in the same PR?

**Test Coverage**
- If this change fixes a confirmed tenant isolation gap, does it include or reference the corresponding regression test?
- Does the change avoid weakening or removing existing test coverage?

**Architectural Integrity**
- Does this change preserve the existing architecture of unmodified modules?
- Does this change avoid introducing new transitional patterns?
- Does this change avoid expanding scope beyond what the referenced task requires?

**Risk Reduction**
- After this change, is the system closer to meeting a roadmap phase's Done Criteria?
- Does this change reduce system risk rather than relocating it to a different component?

---

## 9. Phase Escalation Rule

During Recovery execution, new issues may be discovered in code adjacent to the confirmed gaps. The following rule governs how such discoveries are handled.

**Step 1: Record the issue immediately.**  
Document the finding with file path, nature of the issue, and the task context in which it was discovered. The record must be created before any code change is made in response.

**Step 2: Do not expand the current task's scope automatically.**  
A new finding does not authorize modifying code outside the current task's target area. The discovery of an adjacent issue is not permission to fix it in the same PR.

**Step 3: Evaluate whether it blocks the current phase.**  
If the new issue directly prevents the current phase's Done Criteria from being met — for example, a dependency that must be resolved before a tenant filter can be applied — it may be added to the current phase as a new task with a new task ID. This requires explicit acknowledgment, not silent scope expansion.

**Step 4: Otherwise, defer.**  
If the issue does not block the current phase, it is recorded for evaluation after the current phase's Exit Gate is passed. It may be added to a future phase or to the deferred work list. It does not enter the current phase retroactively.

**Step 5: Evaluate whether it belongs in the Recovery Program at all.**  
Not every discovered issue is a recovery problem. An issue that is unrelated to the four Recovery objectives (tenant isolation, migration governance, test coverage, transitional patterns) belongs in Phase 5 planning, not in the Recovery Program.

---

## 10. Exit Integrity Rule

A phase is not complete because code was changed. A phase is not complete because tests pass. A phase is complete only when all of the following are simultaneously true.

**Condition 1: Roadmap done criteria are met.**  
Every binary criterion listed in the phase's Done Criteria section of the roadmap must evaluate to true. Partial completion is not completion.

**Condition 2: Verification passes.**  
For R1: `npm run test:integration` passes with no regressions.  
For R2: `prisma migrate status` reports zero pending migrations; all three gate scripts exit 0.  
For R3: all new tenant isolation tests pass; the CI gate step fails on injected NULL and passes on clean data.  
For R4: `npm run test:integration` passes with updated test infrastructure; no TypeScript compile errors.

**Condition 3: No new critical regressions were introduced.**  
A phase that closes a confirmed gap while introducing a new critical gap has not improved the system. The net risk of the system after phase completion must be lower than before. If a new critical regression is introduced during a phase, the phase has not passed its Exit Gate and must be re-evaluated before R(n+1) may begin.

**Condition 4: The Exit Gate is explicitly confirmed.**  
The Exit Gate for each phase is a defined set of conditions in the roadmap. Passing the Exit Gate is not implicit. It must be explicitly confirmed against each condition before the next phase begins. Phases that "seem done" are not done until Exit Gate conditions are verified.

---

*End of ERP Recovery Guardrails*

# ERP Recovery Program — Rollback Runbook

**Document Status:** ACTIVE — OPERATIONAL RUNBOOK  
**Scope:** Recovery Program failure containment and rollback only  
**Governed By:** `.qoder/specs/erp-recovery-guardrails.md`  
**Execution Reference:** `.qoder/specs/erp-recovery-execution-plan.md`  

---

## 1. Purpose

This runbook is used when Recovery Program work produces an unexpected failure: a regression introduced by a fix, a prisma state that does not match the expected outcome, a verification gate that fails after a supposed completion, or a cleanup change that breaks existing behavior.

It defines the immediate response, containment actions, rollback procedures, and resume conditions for each failure type. It is not a design document. It is an operator reference for when things go wrong during Recovery execution.

---

## 2. When This Runbook Applies

Use this runbook when any of the following occur during Recovery work:

- An R1 tenant isolation fix causes a previously passing integration test to fail
- `prisma migrate status` shows unexpected output after a baseline or resolve step
- A verification gate script exits non-zero after it was supposed to be clean
- A new tenant isolation test added in R3 reveals a handler gap that R1 was expected to close
- An R4 change to `CompanySettings` → `TenantSettings` migration breaks accounting or journal behavior
- `npx tsc --noEmit` fails after the `DocumentConfirmedEvent` type change in R4-04 or R4-05
- Any integration test regresses after a Recovery task is marked DONE
- The `_prisma_migrations` table is in an inconsistent state after R2 operations

This runbook does **not** apply to pre-existing failures that existed before the Recovery Program began.

---

## 3. Immediate Response Rules

When a failure is detected, apply these rules before doing anything else.

1. **Stop task execution immediately.** Do not continue implementing the current task or begin the next one.

2. **Do not begin the next phase.** If the failure occurs at a phase boundary, the phase transition is blocked until the failure is resolved.

3. **Record the active task ID.** Note which task was in progress and at what step the failure appeared (implementation, verification, or post-verification).

4. **Capture evidence before making more changes.** Record command output, test output, file diffs, or error messages in their current state. Changes made before evidence capture may obscure root cause.

5. **Classify the failure.** Determine which failure class applies (see Section 4) before taking any containment action.

6. **Do not attempt to "fix forward" without root cause.** Making additional changes to resolve a failure without identifying root cause risks compounding the problem. Classify first, then act.

---

## 4. Failure Classification

| Class | Name | Covers |
|-------|------|--------|
| **F1** | Code regression — handler/service | A tenant isolation fix or service change breaks existing behavior; an existing integration test now fails; a previously working API returns incorrect status |
| **F2** | Migration governance / prisma state mismatch | `prisma migrate status` shows unexpected pending migrations; `_prisma_migrations` table has wrong row count or missing rows; a `resolve --applied` step produces an error; `prisma generate` fails |
| **F3** | Verification gate failure | A gate script (`verify-product-tenant-gate.ts`, `verify-document-tenant-gate.ts`, or `verify-counterparty-tenant-gate.ts`) exits non-zero when it was expected to exit 0; gate behavior does not match test expectations |
| **F4** | Test shield failure | A new tenant isolation test fails when it was expected to pass; the failure indicates an R1 handler gap was not fully closed; a migration gate test produces unexpected exit codes |
| **F5** | R4 cleanup regression | A `CompanySettings` → `TenantSettings` redirect breaks accounting, journal, or settings behavior; `DocumentConfirmedEvent` type change causes unexpected TypeScript errors outside the expected scope; a factory update causes R3 tests to fail |

---

## 5. Containment Actions by Failure Class

---

### F1 — Code Regression in Handler/Service

**Immediate containment:**  
Revert the specific handler or service change that introduced the regression using `git`. Do not revert unrelated changes in the same file.

**Evidence to collect:**  
- Which test is failing and what it expects vs. what it receives  
- Git diff of the modified handler/service file  
- `npm run test:integration` output showing the failure

**Task state:**  
Return current task to `IN PROGRESS`. The task is not complete.

**Rollback required:**  
Yes — revert the specific change. Identify which part of the change caused the regression before re-applying.

**Phase progression:**  
Forbidden until the regression is resolved and `npm run test:integration` passes.

---

### F2 — Migration Governance / Prisma State Mismatch

**Immediate containment:**  
Do not run any further `prisma migrate` commands until the state is understood. Do not run `prisma db push`. Record the exact output of `prisma migrate status`.

**Evidence to collect:**  
- Full output of `prisma migrate status`  
- `SELECT * FROM "_prisma_migrations" ORDER BY "finished_at"` — if the table exists  
- List of migration files in `prisma/migrations/` and their timestamps  
- Last `prisma migrate resolve` commands executed

**Task state:**  
Mark R2-02 (or the relevant R2 task) as `BLOCKED`. Include the observed state vs. expected state.

**Rollback required:**  
Depends on the specific mismatch. See R2 rollback scenario in Section 6.

**Phase progression:**  
Forbidden. R3 cannot begin while migration state is inconsistent.

---

### F3 — Verification Gate Failure

**Immediate containment:**  
Do not mark R2-05 as DONE. Do not integrate the failing gate into CI. Record the full gate output including which rows (if any) it reported as invalid.

**Evidence to collect:**  
- Gate script name and exit code  
- Gate output showing which entity and which rows triggered the failure  
- `SELECT id, "tenantId" FROM "<Entity>" WHERE "tenantId" IS NULL` — to confirm whether real NULL rows exist

**Task state:**  
R2-05 remains `IN PROGRESS` if the cause is real NULL data. If the gate script itself has a bug, escalate as a new blocker.

**Rollback required:**  
Not a code rollback. If NULL rows exist in the database, a data remediation step is required before the gate can pass. If the gate has a code bug, the gate script must be fixed (note: gate script modification is within R2 scope only if the script is incorrect, not to bypass valid failures).

**Phase progression:**  
Forbidden until all three gates exit 0.

---

### F4 — Test Shield Failure

**Immediate containment:**  
Do not mark the R3 test task as DONE. Record which specific scenario fails and what the actual response was.

**Evidence to collect:**  
- Test name and failure output  
- The HTTP status returned vs. the expected 404  
- Which handler the test was calling  
- Whether the corresponding R1 task for that handler is in DONE state

**Task state:**  
The R3 test task is `IN PROGRESS`. If the failure reveals that an R1 task was incomplete, the corresponding R1 task returns to `IN PROGRESS`.

**Rollback required:**  
If the root cause is an incomplete R1 fix: return to the R1 task, fix the handler, and re-run the R3 test. No schema rollback required.

**Phase progression:**  
R4 cannot begin while any R3 test is failing.

---

### F5 — R4 Cleanup Regression

**Immediate containment:**  
Revert only the specific change that introduced the regression. If the `TenantSettings` redirect broke accounting behavior, revert that file. If the event type change caused unexpected TypeScript errors, revert `lib/events/types.ts` to its pre-R4-04 state.

**Evidence to collect:**  
- Which test or compile check is failing  
- Whether the failure is in accounting code, test infrastructure, or event type consumers  
- Git diff of R4 changes so far  
- `npx tsc --noEmit` output if TypeScript-related

**Task state:**  
Return the specific R4 task to `IN PROGRESS`.

**Rollback required:**  
Targeted revert of the regression-causing change. Full R4 rollback is only necessary if multiple interdependent changes cannot be individually reverted.

**Phase progression:**  
Program completion is forbidden while any R4 regression is active.

---

## 6. Recovery-Specific Rollback Scenarios

---

### R1 Rollback Scenario

**What can be reverted safely:**  
Individual handler files. Each R1 task targets a specific file and specific handler function. A `git revert` or `git checkout HEAD -- <file>` on the affected handler reverts that task's change without affecting others.

**What must be verified after revert:**  
- `npm run test:integration` passes after the revert  
- The reverted handler no longer returns 404 for cross-tenant access (confirming the revert was effective)  
- No other handler was accidentally affected

**State to restore before resuming:**  
- The reverted task returns to `NOT STARTED`  
- Root cause of the regression must be identified before the task is re-attempted  
- The new attempt must be verified before proceeding to dependent tasks

---

### R2 Rollback Scenario

**What can be reverted safely:**  
Migration files created in R2-03 and R2-04 can be deleted from `prisma/migrations/` if they were not yet resolved as applied. The `_prisma_migrations` table rows added by `resolve --applied` cannot be automatically rolled back via git — they are database state.

**What must be verified after revert:**  
- `prisma migrate status` output matches the expected state (before the failed step)  
- `_prisma_migrations` row count matches expectations  
- No migration file in `prisma/migrations/` is in a partially created state

**State to restore before resuming:**  
- Re-run R2-01 audit to confirm the migration file inventory is accurate  
- Confirm the exact `resolve --applied` commands that succeeded vs. failed  
- Do not re-run any `resolve --applied` step until the inconsistency is understood  
- Resume from the specific R2 task that failed, not from R2-01

**Note:** If the `_prisma_migrations` table is in an unrecoverable inconsistent state on the development database, the development database may need to be reset and the R2 baseline re-established from scratch. This requires re-running R2-02 through R2-07 in full.

---

### R3 Rollback Scenario

**What can be reverted safely:**  
New test files added in R3-01 through R3-04 can be deleted or reverted without affecting production code. The CI gate step added in R3-05 can be removed from the workflow file.

**What must be verified after revert:**  
- `npm run test:integration` passes after test file removal (confirms no test infrastructure was broken)  
- If R3-05 CI step is reverted, verify that the workflow file is still valid YAML  
- Confirm that the root cause (handler gap, gate script issue, or test logic error) is identified before re-creating the test

**State to restore before resuming:**  
- If an R3 test revealed an R1 gap: return the relevant R1 task to `IN PROGRESS`, fix the handler, re-run R1 verification, then re-attempt the R3 test  
- If the test itself had incorrect logic: correct the test, re-run it in isolation, confirm it now passes, then re-run the full suite

---

### R4 Rollback Scenario

**What can be reverted safely:**  
`lib/events/types.ts` type change (R4-04), the emission update in `document-confirm.service.ts` (R4-05), and accounting service redirects from `CompanySettings` to `TenantSettings` (R4-02) can all be reverted individually via `git checkout HEAD -- <file>`.

**What must be verified after revert:**  
- `npx tsc --noEmit` exits 0 after type revert  
- `npm run test:integration` passes after accounting service revert  
- R3 tenant isolation tests still pass after any factory revert (R4-06 related)

**State to restore before resuming:**  
- Each reverted task returns to `NOT STARTED`  
- Confirm whether the failure was in the change itself or in an unexpected dependency  
- If the `TenantSettings` redirect fails because `TenantSettings` data does not exist for all tenants in the development database, the data gap must be addressed before the redirect can succeed  
- Do not re-attempt R4-02 until the `TenantSettings` data availability is confirmed

---

## 7. Verification After Rollback

Run only the checks relevant to the failure class and phase.

| Check | When Required |
|-------|---------------|
| `npm run test:integration` | After any F1, F4, or F5 rollback; after any code revert |
| `prisma migrate status` | After any F2 event; after any database state change |
| `verify-product-tenant-gate.ts`, `verify-document-tenant-gate.ts`, `verify-counterparty-tenant-gate.ts` | After any F3 event; after R2 rollback |
| `npx tsc --noEmit` | After any F5 event involving type changes (R4-04, R4-05) |
| Run specific failing test in isolation | After any F4 event, before running the full suite |
| Code review of reverted file | After any F1 or F5 rollback, to confirm revert did not introduce a different error |

All checks must pass before the task resumes.

---

## 8. Resume Conditions

Work may resume after a rollback or containment event when **all** of the following are true:

1. **Root cause is identified.** A vague "something went wrong" is not sufficient. The specific file, line, or state that caused the failure must be known.

2. **Affected verification now passes.** The specific check that triggered the stop rule must be passing in its current state.

3. **No unexpected schema or database drift remains.** `prisma migrate status` shows the expected state. No unapplied or orphaned migration state exists.

4. **Active task state is updated correctly.** The task that was in progress must reflect its current state (IN PROGRESS or BLOCKED) in the progress tracker.

5. **Stop condition is explicitly cleared.** The stop rule that was triggered (STOP-01 through STOP-07 in the execution plan) must be formally cleared by confirming the condition no longer applies.

6. **No new failure was introduced by the rollback action.** Running `npm run test:integration` after a revert must show zero new failures compared to the pre-failure baseline.

---

## 9. Evidence Recording Template

Use this template when recording a failure event.

```
Task ID:          R_-_  (e.g., R2-03)
Failure Class:    F_    (e.g., F2)
Trigger:          [brief description of what triggered the failure]
Observed Evidence:
  - [command / test / output that showed the failure]
  - [file path or state that was unexpected]
Containment Action:
  - [what was done immediately to contain the situation]
Rollback Action:
  - [what was reverted or reset]
  - [git command or database action taken]
Verification After Rollback:
  - [checks run and their outcomes]
Resume Decision:
  [ ] Root cause identified: [description]
  [ ] Verification passes: [which check, what result]
  [ ] Task state updated: [new state]
  [ ] Stop condition cleared: [which stop rule]
  Work resumed: YES / NO
```

Evidence must be attached or linked in its raw form (output snippets, file paths). Do not summarize evidence that has not been captured.

---

## 10. Non-Goals

This runbook explicitly does **not** cover:

- Full production disaster recovery or infrastructure-level backup/restore
- Database backup, snapshot, or point-in-time recovery procedures
- Rollback of non-Recovery code changes (feature work, pre-Recovery fixes)
- Phase 5 operations or post-Recovery program incidents
- General Prisma schema migration design guidance
- Incident escalation to external stakeholders or SLA management
- Performance degradation events unrelated to Recovery changes
- Security incidents (tenant isolation breaches that predate the Recovery Program)

For production incidents unrelated to Recovery Program tasks, refer to the general operations runbook or escalate through the standard incident response process.

---

*End of ERP Recovery Rollback Runbook*

# ERP Documentation Sync Report

> **Date:** March 2026  
> **Triggered by:** `.qoder/specs/erp-architecture-alignment-check.md`  
> **Scope:** Documentation fixes only — no production code changes

---

## Files Updated

| File | Changes Applied |
|------|----------------|
| `.qoder/specs/erp-normalization-roadmap.md` | GAP-03, GAP-04, GAP-05, GAP-09, GAP-10 |
| `.qoder/specs/erp-architecture-map.md` | GAP-01, GAP-02, GAP-03, GAP-04, GAP-05, GAP-06, GAP-07, GAP-08, GAP-10, GAP-11 |
| `.qoder/specs/erp-architecture-guardrails.md` | No changes needed — guardrails were already authoritative and internally consistent |

---

## Gaps Resolved

### GAP-03 — INV-05 Stale Wording (RESOLVED)

**Files:** Roadmap Section 5, Architecture Map Section 7

**Before:** INV-05 was a single row stating "STRONG (confirm) / WEAK (cancel bypass)". This was stale — P1-01 removed the cancel bypass.

**After:**
- Roadmap Section 5 now has two separate rows: INV-05a and INV-05b
- INV-05a: Document confirm → StockMovements — **STRONG** (unchanged)
- INV-05b: Document cancel → Reversal movements — **MEDIUM** (route delegates to canonical service; cancel sequence is sequential not fully atomic within a single transaction)
- Architecture map Section 7 updated to match

**Note on INV-05b reliability:** The alignment check draft marked this as "MEDIUM or STRONG". After examining the actual service: `cancelDocumentTransactional()` calls `db.document.update()`, `createReversingMovements()`, and `recalculateBalance()` as sequential operations without wrapping them in a single `db.$transaction()`. MEDIUM is the correct rating. STRONG would require all three steps to be inside one transaction.

---

### GAP-04 — INV-13 Missing (RESOLVED)

**Files:** Roadmap Section 5, Architecture Map Section 7

**What was added:**
- INV-13: Document cancelled → CounterpartyBalance recalculated
- Enforcement: direct `recalculateBalance()` call inside `cancelDocumentTransactional()`
- Sync, but not transactionally atomic with status update
- Current reliability: MEDIUM; target: MEDIUM-STRONG

This invariant was fully implemented (the sync call exists) but was undocumented in both the roadmap matrix and the architecture map invariant table.

---

### GAP-05 + GAP-11 — Party Merge PartyLink Task Missing (RESOLVED)

**Files:** Roadmap Phase 3 task list, Architecture Map Section 4 and Section 7

**What was added:**
- New roadmap task **P3-08**: Fix Party merge — atomically update all `PartyLink` records belonging to the merged party to point to the survivor party within the same `db.$transaction()` as the status update.
- P3-03 success criteria updated to include: "Party merge atomically updates all `PartyLink` records to the survivor (P3-08)"
- Architecture map Section 4 (Party Merge write path): transaction note updated to reference P3-08 gap
- Architecture map Section 7 INV-12 target updated from "STRONG (P3+)" to "STRONG (P3-08)"
- Architecture map Section 11 Current vs Target State: new row for Party merge PartyLink consistency
- Architecture map Section 4 (Party Merge): transaction note now explicitly marks the PartyLink update as a P3-08 gap

---

### GAP-10 — INV-08 Phantom Phase Citation (RESOLVED)

**Files:** Roadmap Section 5, Roadmap Section 9, Architecture Map Section 7

**Decision made:** Accept INV-08 at MEDIUM reliability. Full atomicity (single transaction for `paymentStatus` + `confirmDocumentTransactional()`) is not scheduled. The idempotency guard in `confirmEcommerceOrderPayment()` makes webhook retry safe.

**Changes:**
- Roadmap Section 5 INV-08 row: target reliability changed from "STRONG (merged into single transaction)" to "MEDIUM (accepted — idempotency guard present; full atomicity deferred; webhook retry safe)"
- Roadmap Section 9 (Completion Definition): added an explicit "Accepted limitation" note for INV-08 explaining the architectural rationale
- Architecture map Section 7 INV-08 target: changed from "STRONG (P3 full merge)" to "MEDIUM (accepted) — idempotency guard ensures webhook retry safety; full single-transaction atomicity not scheduled"

---

### GAP-09 — Anti-Pattern Numbering Divergence (RESOLVED)

**Files:** Roadmap Section 7

**Before:** The roadmap maintained its own AP-01 through AP-09 list with different numbering from the guardrails AP-01 through AP-15. Code review comments referencing an AP number were ambiguous (e.g., AP-09 meant different things in each document).

**After:** Roadmap Section 7 now redirects to the guardrails as the single authoritative AP registry. The roadmap's own AP list is replaced with:
- A clear statement that the guardrails Section 9 (AP-01 through AP-15) is the canonical list
- A short quick-reference table of the most commonly cited APs (using guardrails numbering)
- A pointer to the guardrails for the full list with rationale

---

### GAP-01 — CounterpartyBalance Ownership Wording (RESOLVED)

**Files:** Architecture Map Section 3 (Ownership Matrix), Section 6 (Projection Map)

**Before:** Labeled as "Finance / Accounting" — a split label that obscured the canonical target.

**After:** "Accounting (currently misplaced in `lib/modules/finance/reports.ts`; target: `accounting/services/balance.service.ts` via P3-03)" — makes the canonical target explicit and cites the roadmap task.

---

### GAP-02 — Customer Canonical Owner Ambiguity (RESOLVED)

**Files:** Architecture Map Section 3 (Ownership Matrix)

**Before:** `Customer` labeled as "Auth / Ecommerce" — implies joint ownership.

**After:** "Auth (canonical write path). Ecommerce has a secondary guest-customer creation path (`quick-order/route.ts`)" — makes Auth the unambiguous canonical owner while acknowledging the secondary path.

---

### GAP-06 — Guest Customer Create Write Path Missing (RESOLVED)

**Files:** Architecture Map Section 4 (Main Write Paths)

**What was added:** New write path entry "Guest Customer Create (Quick Order)" documenting:
- Trigger: `POST /api/ecommerce/orders/quick-order`
- Party mirror gap (P2-05)
- Same INV-02 gap as Telegram auth path

---

### GAP-07 — Dual Handler Registration Rule Missing from Map (RESOLVED)

**Files:** Architecture Map Section 5 (Event Flow Map)

**What was added:** Operational note after the IEventBus statement clarifying:
1. All handlers must be registered in **both** the HTTP cron route and `scripts/process-outbox.ts`
2. Handlers must be idempotent

---

### GAP-08 — StockRecord No Verify Script Task (RESOLVED)

**Files:** Architecture Map Section 11 (Current vs Target State)

**What was added:** New row in the Current vs Target State table: "StockRecord consistency verification — No verify script exists → `verify-stock-record.ts` validates aggregates against movements → P3-04 sub-task or P4"

---

## Gaps Intentionally Left Unresolved

### None.

All 11 gaps from the alignment check were resolved. No gap was intentionally deferred.

---

## Architecture Guardrails — No Changes Needed

The guardrails document (`erp-architecture-guardrails.md`) was fully consistent with the other documents for all structural rules. No edits were required. It remains the authoritative AP registry (Section 9, AP-01 through AP-15) that the roadmap now references.

---

## Phase 2 Readiness Assessment

**Status: READY TO PROCEED TO PHASE 2**

| Readiness Criterion | Status |
|--------------------|----|
| Invariant matrix reflects actual post-P1 system state | ✅ Updated (INV-05a/05b, INV-08, INV-13) |
| All roadmap task citations point to real tasks | ✅ INV-12 → P3-08 (now real), INV-08 → accepted MEDIUM (no phantom task) |
| AP numbering is unambiguous for code review | ✅ Single source of truth: guardrails AP-01 to AP-15 |
| Party merge gap is tracked | ✅ P3-08 added to roadmap |
| Guest customer creation path is documented | ✅ Added to architecture map |
| Domain ownership is unambiguous | ✅ CounterpartyBalance → Accounting; Customer canonical → Auth |
| All three documents cross-reference consistently | ✅ Verified |

**Phase 2 tasks to execute (from roadmap):**
- P2-01: Emit `product.updated` in product mutation route
- P2-02: Emit `sale_price.updated` in price mutation route
- P2-03: Emit `discount.updated` in discount mutation route
- P2-04: `resolveParty()` inside `db.customer.create()` transaction (Telegram auth)
- P2-05: `resolveParty()` after guest customer creation (quick-order)
- P2-06: Remove `registerAccountingHandlers(bus)` from production boot path
- P2-07: Add dead-letter queue semantics to `processOutboxEvents()`
- P2-08: Document outbox SLA

---

*Documentation sync complete. No production code was modified.*

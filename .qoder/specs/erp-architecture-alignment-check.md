# ERP Architecture Alignment Check

> **Version:** 1.0  
> **Date:** March 2026  
> **Reviewer:** Architecture Alignment Agent  
> **Scope:** Cross-document consistency validation

**Documents validated:**
- `.qoder/specs/erp-normalization-roadmap.md` (roadmap)
- `.qoder/specs/erp-architecture-guardrails.md` (guardrails)
- `.qoder/specs/erp-architecture-map.md` (architecture map)

---

## Summary

| Check Category | Total Checked | Inconsistencies Found | Severity |
|---------------|--------------|----------------------|----------|
| Domain ownership conflicts | 9 domains | 2 minor gaps | LOW |
| Invariants present across all three documents | 12 | 1 missing from roadmap matrix | MEDIUM |
| Write paths covered by roadmap | 9 | 2 write paths not explicitly covered | LOW |
| Event flows vs guardrail rules | 4 event types | 0 conflicts | PASS |
| Projections covered | 3 projections | 1 gap: StockRecord not in roadmap task scope | LOW |
| Anti-pattern numbering consistency | 15 APs (guardrails) / 9 APs (roadmap) | Numbering divergence between documents | LOW |
| Cross-reference accuracy | All roadmap phases cited | 2 roadmap phase citations incorrect | MEDIUM |

**Overall status: CONSISTENT WITH MINOR GAPS — safe to continue Phase 2 implementation.**

---

## 1. Domain Ownership Consistency

### Check: Does the architecture map's domain ownership match what the guardrails and roadmap assume?

| Domain | Roadmap Assumes | Guardrails Assumes | Map States | Verdict |
|--------|----------------|-------------------|-----------|---------|
| `Document` owned by Accounting | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `StockMovement` owned by Inventory | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `Product` owned by Accounting | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `Counterparty` owned by Accounting | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `Customer` owned by Auth/Ecommerce | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `Party` owned by CRM | ✅ Yes | ✅ Yes | ✅ Yes | PASS |
| `JournalEntry` owned by Finance | ✅ Yes | Implied | ✅ Yes | PASS |
| `CounterpartyBalance` ownership | Accounting (target) | Not explicitly stated | "Finance / Accounting" (split) | MINOR GAP |
| `OutboxEvent` owned by Events | ✅ Yes | ✅ Yes | ✅ Yes | PASS |

### GAP-01: `CounterpartyBalance` Ownership Split

**Observation:** The architecture map labels `CounterpartyBalance` ownership as "Finance / Accounting (currently misplaced)". The roadmap states the target location is `accounting/services/balance.service.ts` (P3-03). The guardrails do not define an explicit owner.

**Inconsistency level:** LOW — the current misplacement is acknowledged in all documents; the disagreement is that the architecture map uses a split label rather than stating a single canonical target owner.

**Recommendation:** Update the architecture map's ownership matrix to say "Accounting (target, via P3-03)" rather than "Finance / Accounting" to be consistent with the roadmap target.

---

### GAP-02: `Customer` Domain Owner Ambiguity

**Observation:** The architecture map labels `Customer` as owned by "Auth / Ecommerce". The guardrails state "Auth route delegates to this service for Customer+Party" (Section 5, Mirror Invariants). The roadmap tasks P2-04 and P2-05 treat the creation routes as `app/api/auth/customer/telegram/route.ts` and `app/api/ecommerce/orders/quick-order/route.ts` respectively.

**Inconsistency level:** LOW — the "Auth / Ecommerce" dual-domain label is accurate for today's state, but creates ambiguity for new developers. The canonical write path for `Customer` is auth routes; the ecommerce path is a secondary (guest) path.

**Recommendation:** The architecture map should clarify that the canonical owner is Auth, with Ecommerce having a secondary (guest customer) creation path.

---

## 2. Invariant Consistency

### Check: Are all 12 invariants in the architecture map also present in the roadmap's Section 5 matrix?

| Invariant | In Architecture Map | In Roadmap Section 5 | In Guardrails | Verdict |
|-----------|--------------------|-----------------------|--------------|---------|
| INV-01 Counterparty → Party | ✅ | ✅ | ✅ Section 5 Mirror Invariants | PASS |
| INV-02 Customer → Party | ✅ | ✅ | ✅ Section 5 Mirror Invariants | PASS |
| INV-03 Customer → Counterparty | ✅ | ✅ | ✅ Section 5 Bridge Invariants | PASS |
| INV-04 Product/Price/Discount → Projection | ✅ | ✅ | ✅ Section 5 Projection Invariants | PASS |
| INV-05a Document confirm → StockMovements | ✅ (split into 05a/05b) | ✅ (as single INV-05) | ✅ Section 5 Lifecycle Invariants | MINOR MISMATCH |
| INV-05b Document cancel → Reversal movements | ✅ | Not split (merged into INV-05) | ✅ | MINOR MISMATCH |
| INV-06 Document confirm → CounterpartyBalance | ✅ | ✅ | ✅ | PASS |
| INV-07 Document confirm → JournalEntry | ✅ | ✅ | ✅ | PASS |
| INV-08 Payment mark → Document confirm | ✅ | ✅ | ✅ | PASS |
| INV-09 Product → tenantId | ✅ | ✅ | ✅ Section 5 Tenant Isolation | PASS |
| INV-10 Document → tenantId | ✅ | ✅ | ✅ Section 5 Tenant Isolation | PASS |
| INV-11 Outbox is sole event path | ✅ | ✅ | ✅ Section 6 | PASS |
| INV-12 Party merge → PartyLink consistency | ✅ | ✅ | ✅ | PASS |

### GAP-03: INV-05 Split (CONFIRM vs CANCEL) — Architecture Map vs Roadmap

**Observation:** The architecture map splits INV-05 into INV-05a (confirm → stock) and INV-05b (cancel → reversal). The roadmap Section 5 table lists INV-05 as a single row: "Document confirm → Stock movements / Confirmation atomically creates StockMovements" with a note about cancel bypass being WEAK.

**Inconsistency level:** MEDIUM — the reliability states have diverged between documents. The architecture map marks INV-05b as STRONG (post P1-01), while the roadmap's INV-05 row still says "STRONG (confirm) / WEAK (cancel bypass)" because it was written before P1-01 was completed.

**Recommendation:** Update the roadmap Section 5 INV-05 row to reflect the P1-01 completion: split into INV-05a and INV-05b, with INV-05b now MEDIUM (route delegates to service but transaction boundary not fully atomic on cancel path).

---

### GAP-04: No INV for `Document cancel → CounterpartyBalance` (async gap)

**Observation:** The architecture map's write path for "Document Cancel" states: "Reversing StockMovements created; CounterpartyBalance recalculated (sync)". The invariant map (Section 7) only maps Document cancel to "Reversing StockMovement" under INV-05b. The CounterpartyBalance recalculation on cancel is not captured as a named invariant.

This is also not mentioned in the roadmap Section 5 invariant matrix.

**Inconsistency level:** MEDIUM — the cancel → balance recalc path is a real synchronous side effect documented in the write path section and the projection section, but absent from the invariant table. If this path breaks, there is no invariant tracking it.

**Recommendation:** Add to the architecture map Section 7 a new invariant: `INV-13 Document cancelled → CounterpartyBalance recalculated (sync, via cancelDocumentTransactional)`. Add to the roadmap Section 5 matrix.

---

## 3. Write Path Coverage

### Check: Are all write paths in the architecture map referenced by at least one roadmap task?

| Write Path | Roadmap Task | Guardrail Rule | Verdict |
|-----------|-------------|---------------|---------|
| Product create/update | P2-01 (emission) | AP-01 (no db in routes) | PASS |
| Sale price update | P2-02 | AP-01, Projection Invariant rule | PASS |
| Discount update | P2-03 | AP-01, Projection Invariant rule | PASS |
| Customer create (Telegram) | P2-04 | AP-10 (customer.create without resolveParty forbidden) | PASS |
| Counterparty create | P1-02, P1-03 ✅ Done | AP-09 | PASS |
| Customer → Counterparty bridge | P1-04 ✅ Done | AP-07 (non-atomic cross-entity) | PASS |
| Document confirm | P1-01 context, P2 event emission | Section 4 canonical path | PASS |
| Document cancel | P1-01 ✅ Done | Section 4 canonical path | PASS |
| Order payment confirm | P1-05 ✅ Done | AP-11 (duplicate write) | PASS |
| Party merge | No explicit roadmap task | No explicit guardrail rule | GAP |

### GAP-05: Party Merge Write Path — No Roadmap Task

**Observation:** The architecture map documents the Party Merge write path with a known gap: "Sets `party.status = "merged"`, `party.mergedIntoId`; does not update PartyLinks". INV-12 marks this as MEDIUM reliability. There is no roadmap task (P1 through P4) that addresses this gap.

**Inconsistency level:** MEDIUM — an acknowledged reliability gap with no scheduled remediation. The roadmap roadmap success criteria in Section 9 require all invariants to reach STRONG or MEDIUM-STRONG, but INV-12 has no assigned phase task.

**Recommendation:** Add a task to Phase 3 (or Phase 2 as P2-09) to update the Party merge service to atomically re-point `PartyLink` records to the survivor party. Record it in the roadmap Section 5 matrix with the target phase.

---

### GAP-06: Guest Customer Creation Write Path

**Observation:** The architecture map documents "Customer Create (Telegram Auth)" but does not document "Guest Customer Create (Quick Order)" as a separate write path. The roadmap has P2-05 specifically for this (`app/api/ecommerce/orders/quick-order/route.ts`), indicating it is a distinct path with its own invariant gap (no Party mirror for guest customers).

**Inconsistency level:** LOW — the roadmap correctly covers this in P2-05. The architecture map's omission is a documentation gap rather than a correctness risk. The quick-order path uses a synthetic `telegramId` and creates a guest customer that also lacks a Party mirror.

**Recommendation:** Add a "Guest Customer Create (Quick Order)" write path entry to architecture map Section 4.

---

## 4. Event Flow Consistency

### Check: Are the event flow rules in the architecture map consistent with guardrail rules?

| Rule in Guardrails | Statement in Architecture Map | Consistent? |
|-------------------|------------------------------|-------------|
| Outbox is sole production event path | Section 5: "IEventBus is test infrastructure only" | ✅ PASS |
| IEventBus is test-only | Section 5: "It is not called in any production code path" | ✅ PASS |
| Outbox event must be inside same `db.$transaction()` | Section 4 Document Confirm write path shows correct structure | ✅ PASS |
| Handler must be registered in both HTTP cron route AND CLI script | Section 5 Event Registry does not mention the dual-registration requirement | MINOR GAP |
| Adding new event type requires updating `event-types.md` | Not mentioned in architecture map | MINOR GAP |
| Handlers must be idempotent | Not stated in Section 5 | MINOR GAP |

### GAP-07: Architecture Map Section 5 Missing Operational Event Rules

**Observation:** The guardrails define three operational rules for events that the architecture map does not document:
1. All outbox handlers must be registered in **both** `app/api/system/outbox/process/route.ts` AND `scripts/process-outbox.ts`.
2. New event types require updating `.qoder/specs/event-types.md`.
3. Handlers must be idempotent (safe to call multiple times for the same event).

**Inconsistency level:** LOW — the architecture map is not required to repeat all operational rules (that is the guardrails' job). However, the dual-registration requirement is architecturally significant and is the type of structural fact the map should capture.

**Recommendation:** Add a note to architecture map Section 5 under "Production Event Architecture" stating: "All handlers must be registered in both the HTTP cron route and `scripts/process-outbox.ts`. Handlers must be idempotent."

---

### Check: All four event types in the map match the `lib/events/types.ts` union

The architecture map lists:
- `DocumentConfirmed` ✅ — in `DomainEvent` union
- `product.updated` ✅ — in `DomainEvent` union
- `sale_price.updated` ✅ — in `DomainEvent` union
- `discount.updated` ✅ — in `DomainEvent` union

**Verdict: PASS.** No undocumented event types detected.

---

## 5. Projection Coverage

### Check: Are all projections in the architecture map consistent with their roadmap and guardrail treatment?

| Projection | In Architecture Map | In Roadmap | In Guardrails | Verdict |
|-----------|--------------------|-----------|---------|-|
| `ProductCatalogProjection` | Section 6 full entry | P2-01/02/03 (emission), Section 6 canonical structure | Section 7 Projection Invariants, Section 2 Projection Rules | PASS |
| `StockRecord` | Section 6 full entry | P3-04 (legacy path removal) | Section 5 Lifecycle Invariants | MINOR GAP |
| `CounterpartyBalance` | Section 6 full entry | P3-03 (move to balance.service) | Implied in Section 5 | PASS |

### GAP-08: StockRecord Projection Not in a P2 Roadmap Task

**Observation:** The architecture map correctly documents `StockRecord` as a projection of `StockMovement` with "Strong" consistency. The roadmap's only task touching this projection is P3-04 (remove legacy `recalculateStock()` path). There is no roadmap task to validate that `reconcileStockRecord()` is the sole update path or to add a verify script for StockRecord consistency.

**Inconsistency level:** LOW — `StockRecord` is currently STRONG consistency via the synchronous confirm path. The absence of a verify gate script (analogous to `verify-product-catalog-projection.ts`) is a monitoring gap, not a correctness gap.

**Recommendation:** Add a P4 task (or P3-04 sub-task) to add a `verify-stock-record.ts` script that checks `StockRecord` row counts match the sum of `StockMovement` aggregates per product/warehouse. Reference in the roadmap success criteria.

---

## 6. Anti-Pattern Numbering Divergence

### Check: Are anti-patterns consistently numbered and defined across documents?

The guardrails define **AP-01 through AP-15** (15 anti-patterns, Section 9).  
The roadmap defines **AP-01 through AP-09** (9 anti-patterns, Section 7).

**Cross-reference table of conflicting or additional APs:**

| Guardrails AP | Roadmap AP | Same definition? |
|--------------|-----------|-----------------|
| AP-01: `db` import in routes | AP-01: same | ✅ PASS |
| AP-02: `db.$transaction()` in routes | Not in roadmap | ROADMAP GAP |
| AP-03: Duplicate write paths | AP-02: same concept | ✅ PASS (different number) |
| AP-04: State machine logic in routes/services | AP-03: same | ✅ PASS (different number) |
| AP-05: `createOutboxEvent()` outside transaction | Not in roadmap | ROADMAP GAP |
| AP-06: `eventBus.publish()` in production | AP-05: same | ✅ PASS |
| AP-07: `registerAccountingHandlers` in production | Not explicitly an AP in roadmap | Minor |
| AP-08: Direct call to projection from route | AP-04: same | ✅ PASS |
| AP-09: `db.counterparty.create()` outside service | AP-09: same | ✅ PASS |
| AP-10: `db.customer.create()` without `resolveParty` | AP-10: Not in roadmap | ROADMAP GAP |
| AP-11: Two implementations of same write | AP-02: overlaps | Minor |
| AP-12: God files | AP-06: same | ✅ PASS |
| AP-13: `tenantId` from request body | AP-08: same | ✅ PASS |
| AP-14: `recalculateStock()` alongside `reconcileStockRecord()` | AP-09 (different): same concept | Numbering conflict |
| AP-15: Cross-module bypass of barrel | Not in roadmap APs | ROADMAP GAP |

### GAP-09: Roadmap AP Numbering Does Not Match Guardrails

**Observation:** The roadmap Section 7 defines 9 anti-patterns (AP-01 through AP-09). The guardrails Section 9 defines 15 (AP-01 through AP-15). Three of the roadmap APs (AP-07 through AP-09) map to different guardrail APs by number. Specifically:
- Roadmap AP-07 = Non-Atomic Cross-Entity Creation = Guardrails AP-07 (different: that is `registerAccountingHandlers` in production)
- Roadmap AP-09 = Legacy Calculation Paths = Guardrails AP-14

This means a developer referencing "AP-09" in code review will get different rules depending on which document they consult.

**Inconsistency level:** MEDIUM — not a correctness issue, but a communication hazard. Code review comments referencing "AP-09" are ambiguous.

**Recommendation:** The roadmap's AP list should either: (a) be removed and replaced with a reference to the guardrails' definitive AP list, or (b) the guardrails' AP numbers should be used as the single authoritative numbering in both documents.

---

## 7. Roadmap Phase Citation Accuracy

### Check: Do the roadmap phase citations in the architecture map point to real tasks?

| Architecture Map Citation | Roadmap Task Exists? | Verdict |
|--------------------------|---------------------|---------|
| P1-01 (cancel route) | ✅ P1-01 | PASS |
| P1-02 (counterparty service) | ✅ P1-02 | PASS |
| P1-03 (route update) | ✅ P1-03 | PASS |
| P1-04 (orders.ts) | ✅ P1-04 | PASS |
| P1-05 (payment merge) | ✅ P1-05 | PASS |
| P2-01/02/03 (event emission) | ✅ P2-01, P2-02, P2-03 | PASS |
| P2-04 (Customer Party) | ✅ P2-04 | PASS |
| P2-06 (IEventBus removal) | ✅ P2-06 | PASS |
| P3-01/02 (ecom merge) | ✅ P3-01, P3-02 | PASS |
| P3-03 (recalculateBalance move) | ✅ P3-03 | PASS |
| P3-04 (legacy stock) | ✅ P3-04 | PASS |
| P3-05/06 (factories) | ✅ P3-05, P3-06 | PASS |
| P3-07 (publishDocumentConfirmed) | ✅ P3-07 | PASS |
| P4-01/02/03 (tenantId constraints) | ✅ P4-01, P4-02, P4-03 | PASS |
| P4-04/05/06 (ESLint/CI) | ✅ P4-04, P4-05, P4-06 | PASS |
| "P3 full merge" (INV-08 target) | ❌ No specific P3 task for payment atomicity | GAP |
| "P3+" (INV-12 target) | ❌ No specific P3+ task for PartyLink merge consistency | GAP |

### GAP-10: INV-08 Target Phase Cites Non-Existent Task

**Observation:** The architecture map's invariant table lists INV-08 (Payment mark → Document confirm) with `Target Reliability: STRONG (P3 full merge)`. The roadmap has no Phase 3 task addressing payment atomicity. P3 tasks are: ecom merge (P3-01/02), balance move (P3-03), legacy stock (P3-04), factories (P3-05/06), dead code (P3-07).

**Inconsistency level:** MEDIUM — the architecture map implies this will be resolved in P3 but the roadmap has no task for it. The known split between `paymentStatus` update and `confirmDocumentTransactional()` has no remediation scheduled.

**Recommendation:** Either add a P3-08 task to the roadmap for full payment atomicity (unifying `paymentStatus` + `confirmDocumentTransactional()` into a single transaction), or change the architecture map INV-08 target to "MEDIUM (accepted, idempotency guard)" with a note that full atomicity requires future roadmap task.

---

### GAP-11: INV-12 Target Phase Cites "P3+"

**Observation:** The architecture map's invariant table lists INV-12 (Party merge → PartyLink consistency) with `Target Reliability: STRONG (P3+)`. The roadmap has no Phase 3 (or Phase 4) task for updating PartyLinks during Party merge. This is consistent with GAP-05 above.

**Inconsistency level:** MEDIUM — same root cause as GAP-05.

**Recommendation:** Same as GAP-05: add a roadmap task (P3-08 or P2-09) for Party merge PartyLink update.

---

## 8. Guardrails Rule Coverage in Architecture Map

### Check: Does the architecture map acknowledge every non-negotiable guardrail rule category?

| Guardrail Category | Covered in Architecture Map | Notes |
|-------------------|---------------------------|-------|
| Route Layer Rules | Section 10 (Forbidden Dependencies) | Partial — not all route rules explicitly stated |
| Service Layer Rules | Section 4 (Write Paths), Section 10 | ✅ Adequate |
| Domain Layer Rules | Section 10 (Dependency Rules) | Mentioned briefly |
| Event Architecture Rules | Section 5 (Event Flow Map) | ✅ Adequate |
| Projection Rules | Section 6 (Projection Map) | ✅ Adequate |
| Tenant Isolation Rules | Section 7 (INV-09/10), Section 9 (RISK-06) | ✅ Adequate |
| Identity / CRM Mirror Rules | Section 7 (INV-01/02), Section 4 write paths | ✅ Adequate |

**Verdict: PASS.** The architecture map does not need to repeat all guardrail rules, but correctly references the key categories. No significant rule is contradicted.

---

## 9. Consolidated Gap Register

| Gap ID | Severity | Category | Description | Action Required |
|--------|---------|----------|-------------|----------------|
| GAP-01 | LOW | Domain Ownership | `CounterpartyBalance` labeled "Finance / Accounting" vs roadmap target "Accounting" | Update architecture map ownership matrix |
| GAP-02 | LOW | Domain Ownership | `Customer` domain owner "Auth / Ecommerce" is ambiguous | Clarify canonical owner (Auth) vs secondary path (Ecommerce) in map |
| GAP-03 | MEDIUM | Invariant | INV-05 split (map 05a/05b) vs roadmap (single INV-05); reliability state stale in roadmap | Update roadmap Section 5 INV-05 to reflect P1-01 completion |
| GAP-04 | MEDIUM | Invariant | Document cancel → CounterpartyBalance not captured as a named invariant (INV-13 missing) | Add INV-13 to architecture map and roadmap matrix |
| GAP-05 | MEDIUM | Write Path | Party merge PartyLink consistency gap has no roadmap task | Add task to roadmap P3 or create P2-09 |
| GAP-06 | LOW | Write Path | Guest Customer Create (quick-order) write path absent from architecture map Section 4 | Add write path entry to architecture map |
| GAP-07 | LOW | Event Flow | Dual-registration requirement and handler idempotency not stated in architecture map Section 5 | Add note to architecture map Section 5 |
| GAP-08 | LOW | Projection | StockRecord has no verify script / no roadmap task for consistency verification gate | Add sub-task to P3-04 or P4 |
| GAP-09 | MEDIUM | Anti-Pattern | AP numbering diverges between roadmap (AP-01 to AP-09) and guardrails (AP-01 to AP-15) | Standardize on guardrails numbering; remove or replace roadmap AP list with a reference |
| GAP-10 | MEDIUM | Phase Citation | INV-08 target "STRONG (P3 full merge)" has no corresponding P3 roadmap task | Add P3-08 to roadmap OR change target reliability to "MEDIUM (accepted)" |
| GAP-11 | MEDIUM | Phase Citation | INV-12 target "STRONG (P3+)" has no corresponding roadmap task | Same as GAP-05 — add task |

---

## 10. What Is Fully Consistent (No Action Required)

The following areas have **zero inconsistencies** across all three documents:

1. **Document lifecycle ownership** — Accounting owns Document, state machine, cancel, confirm across all three documents.
2. **Canonical event delivery path** — All three documents agree: outbox is production, IEventBus is test-only.
3. **Counterparty → Party invariant** — All three agree on current MEDIUM reliability (compensating pattern), enforcement owner (`createCounterpartyWithParty()`), and the P1-02 task as the implementation.
4. **Product → ProductCatalogProjection invariant** — All three agree: MISSING reliability, P2-01/02/03 as remediation.
5. **Tenant isolation strategy** — All three agree: runtime first, backfill second, schema constraint in P4.
6. **Phase 1 completion status** — All three documents are consistent that P1-01 through P1-05 are complete.
7. **Forbidden pattern list** (by concept, ignoring numbering) — All core forbidden patterns are present in all three documents.
8. **Projection builder/orchestrator two-component structure** — Defined in guardrails, implemented in map's ProductCatalogProjection entry, referenced in roadmap P2 tasks.
9. **`cancelDocumentTransactional()` as canonical cancel service** — Consistent in all three documents.
10. **Ecommerce directory split** — Consistently described as RISK-05 / P3-01/02 across map and roadmap.

---

## 11. Recommended Actions by Priority

### Immediate (before Phase 2 implementation begins)

**Action 1 — Resolve GAP-03:** Update roadmap Section 5 INV-05 to reflect that cancel bypass (P1-01) is now fixed. Split into INV-05a and INV-05b. Mark INV-05b current reliability as MEDIUM (not WEAK — route now delegates to service, but cancel is not fully transactional).

**Action 2 — Resolve GAP-04:** Add INV-13 (`Document cancelled → CounterpartyBalance recalculated`) to:
- Architecture map Section 7 (Invariant Map)
- Roadmap Section 5 (Cross-Module Invariants matrix)

**Action 3 — Resolve GAP-05 + GAP-11:** Add a roadmap task (suggested: P3-08) for Party merge PartyLink consistency. Update INV-12 target phase citation in the architecture map.

**Action 4 — Resolve GAP-10:** Either add P3-08 (or relabel the existing suggestion) for payment atomicity, or explicitly accept the split as "MEDIUM (accepted)" and document the idempotency guard as sufficient for current risk tolerance.

### Before Phase 3 begins

**Action 5 — Resolve GAP-09:** Align anti-pattern numbering. Remove the roadmap AP list and replace with: "See `.qoder/specs/erp-architecture-guardrails.md` Section 9 for the complete anti-pattern registry (AP-01 through AP-15)."

**Action 6 — Resolve GAP-08:** Add a verify script task for StockRecord to Phase 4 tasks.

### Low priority (before Phase 4 begins)

**Action 7 — Resolve GAP-01:** Update architecture map ownership matrix for `CounterpartyBalance`: change "Finance / Accounting" to "Accounting (current misplacement in `finance/reports.ts`, target: `accounting/services/balance.service.ts` via P3-03)".

**Action 8 — Resolve GAP-02:** Clarify `Customer` canonical owner in architecture map: "Auth (canonical write path). Ecommerce has secondary guest customer creation path."

**Action 9 — Resolve GAP-06:** Add "Guest Customer Create (Quick Order)" write path to architecture map Section 4.

**Action 10 — Resolve GAP-07:** Add a note to architecture map Section 5 about dual-registration requirement and handler idempotency.

---

## 12. Alignment Verdict

The three documents are **substantively consistent**. No document contradicts another on a core architectural decision, ownership boundary, or canonical write path.

The gaps identified are:
- **3 stale/missing roadmap task entries** that need new tasks added (GAP-05, GAP-10, GAP-11)
- **2 roadmap table rows** that need updating to reflect P1-01 completion (GAP-03, GAP-04)
- **1 numbering consistency issue** that creates code review ambiguity (GAP-09)
- **4 minor documentation gaps** in the architecture map (GAP-01, GAP-02, GAP-06, GAP-07, GAP-08)

**None of the gaps block Phase 2 implementation.** The most important action before Phase 2 begins is Action 1 (update INV-05 reliability in the roadmap) to ensure the invariant matrix reflects the actual post-P1 state of the system.

---

*This alignment check was performed on all three architecture documents as of March 2026 (post Phase 1 completion).*  
*Re-run this check after each phase completes to keep documents synchronized.*

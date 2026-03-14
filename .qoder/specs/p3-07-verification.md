# P3-07 Verification Document

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P3-07 |
| **Name** | Remove `publishDocumentConfirmed()` dead code |
| **Phase** | Phase 3 — Module Normalization |
| **Date** | 2026-03-14 |
| **Status** | ✅ **COMPLETE** |

---

## Function Removed

**Function:** `publishDocumentConfirmed()`

**Location:** `lib/modules/accounting/services/document-confirm.service.ts` (lines 352-366)

**Previous implementation:**
```typescript
// ---------------------------------------------------------------------------
// DEPRECATED: publishDocumentConfirmed()
// ---------------------------------------------------------------------------
//
// This function is no longer used. Outbox events are written inside
// confirmDocumentTransactional() transaction. Kept for backwards compatibility.
//
// Phase 2.1: This will be removed after pilot validation.
//
export async function publishDocumentConfirmed(
  _result: ConfirmedDocumentResult
): Promise<void> {
  // No-op: events are now written to outbox inside confirmDocumentTransactional()
  // This function is kept for backwards compatibility during transition.
}
```

---

## File Changed

| File | Change |
|------|--------|
| `lib/modules/accounting/services/document-confirm.service.ts` | Removed 16 lines (deprecated function + comment block) |
| `lib/modules/accounting/services/document-confirm.service.ts` | Updated header comment (lines 1-14) to reflect current architecture |

---

## Call Site Verification

### Grep Search Results

```bash
$ grep -r "publishDocumentConfirmed" --include="*.ts" .
```

**Results:** 3 matches, all within the same file:

| Line | Content | Context |
|------|---------|---------|
| 10 | `* publishDocumentConfirmed():` | Header comment (removed) |
| 353 | `// DEPRECATED: publishDocumentConfirmed()` | Section comment (removed) |
| 361 | `export async function publishDocumentConfirmed(` | Function definition (removed) |

**Conclusion:** ✅ No external call sites existed. The function was only self-referenced within its own deprecation documentation.

---

## Outbox Event Emission Confirmation

The `DocumentConfirmed` outbox event is correctly emitted inside `confirmDocumentTransactional()`:

```typescript
// Step 6: Mark confirmed + write outbox event — atomic transaction
// Only reached if steps 3–5 all succeeded
const confirmedAt = new Date();

const confirmed = await db.$transaction(async (tx) => {
  const updated = await tx.document.update({
    where: { id: documentId },
    data: {
      status: "confirmed",
      confirmedAt,
      confirmedBy: actor,
    },
    // ... includes ...
  });

  // Write outbox event in same transaction
  await createOutboxEvent(
    tx,
    {
      type: "DocumentConfirmed",
      occurredAt: confirmedAt,
      payload: {
        documentId: updated.id,
        documentType: updated.type,
        documentNumber: updated.number,
        counterpartyId: updated.counterpartyId,
        warehouseId: updated.warehouseId,
        totalAmount: updated.totalAmount,
        confirmedAt,
        confirmedBy: actor,
      },
    },
    "Document",
    updated.id
  );

  return updated;
});
```

**Key points:**
- Outbox event is written inside the same `db.$transaction()` as the document status update
- This ensures atomicity: either both the confirmation and event emission succeed, or both fail
- No separate `publishDocumentConfirmed()` call is needed

---

## TypeScript Compilation Result

```bash
$ npx tsc --noEmit
```

**Result:** ✅ **Clean** — No compilation errors

---

## Test Suite Result

```bash
$ npx vitest run
```

**Result:** ✅ **All tests passing**

| Metric | Value |
|--------|-------|
| Test Files | 38 passed |
| Tests | 737 passed |
| Duration | 121.04s |

---

## Behavioral Regression Check

| Check | Result |
|-------|--------|
| Function behavior preserved | ✅ N/A — function was a no-op |
| Outbox emission still works | ✅ Confirmed inside transaction |
| No call sites broken | ✅ No external references existed |
| Test suite passes | ✅ Confirmed |
| TypeScript compilation clean | ✅ Confirmed |

---

## ERP Invariant Impact Assessment

| Invariant | Impact | Status |
|-----------|--------|--------|
| INV-07 | Document confirm → Finance Journal | ✅ **Unaffected** — outbox emission still inside transaction |
| INV-08 | Payment mark → Document confirm | ✅ **Unaffected** — no change to payment flow |
| INV-11 | Outbox is sole event path | ✅ **Unaffected** — outbox still used correctly |

**Summary:** This was a dead code removal with zero impact on ERP invariants. The outbox event emission path remains intact and correctly implemented inside `confirmDocumentTransactional()`.

---

## Event Ownership Confirmation

| Before | After |
|--------|-------|
| `publishDocumentConfirmed()` existed as deprecated no-op | ✅ **Removed** |
| Outbox emission in `confirmDocumentTransactional()` | ✅ **Still active** |
| Event handled by outbox handlers | ✅ **Unchanged** |

**Current event flow:**
1. `confirmDocumentTransactional()` updates document status
2. Same transaction writes `DocumentConfirmed` outbox event
3. Outbox processor dispatches to registered handlers
4. Handlers update Finance Journal, CounterpartyBalance, etc.

---

## Summary

P3-07 successfully removed the deprecated `publishDocumentConfirmed()` function from `document-confirm.service.ts`. The function was a no-op placeholder that had been superseded by direct outbox event emission inside `confirmDocumentTransactional()`. 

No external call sites existed, all tests pass, and the outbox-based event architecture remains fully functional. The removal reduces code clutter and eliminates confusion about the correct event emission path.

**Next Task:** P3-08 — Fix Party merge: atomically update `PartyLink` records to point to the survivor party.

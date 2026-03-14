# P3-08 Verification Document

## Task Information

| Field | Value |
|-------|-------|
| **Task** | P3-08 |
| **Name** | Fix Party merge: atomically update PartyLink records |
| **Phase** | Phase 3 — Module Normalization |
| **Date** | 2026-03-14 |
| **Status** | ✅ **COMPLETE / ALREADY IMPLEMENTED** |

---

## Finding

The required functionality **already exists** in the codebase. No production code changes were required.

---

## Implementation Location

**File:** `lib/party/services/party-merge.ts`

**Function:** `executeMerge()` (lines 70-194)

**PartyLink update occurs at lines 94-98:**

```typescript
await db.$transaction(async (tx) => {
  // 1. Mark victim as merged
  await tx.party.update({
    where: { id: finalVictimId },
    data: {
      status: "merged",
      mergedIntoId: finalSurvivorId,
      mergedAt: new Date(),
    },
  });

  // 2. Reassign PartyLinks from victim to survivor  ← ALREADY ATOMIC
  await tx.partyLink.updateMany({
    where: { partyId: finalVictimId },
    data: { partyId: finalSurvivorId },
  });

  // 3. Reassign PartyOwners from victim to survivor...
  // ... rest of transaction
});
```

---

## Evidence: Atomic Transaction

| Aspect | Evidence |
|--------|----------|
| **Transaction boundary** | ✅ `await db.$transaction(async (tx) => { ... })` (line 83) |
| **PartyLink update** | ✅ `tx.partyLink.updateMany()` uses transaction client `tx` (line 95) |
| **Atomic with status update** | ✅ Both Party status update and PartyLink update are inside same transaction block |
| **No stale links** | ✅ `where: { partyId: finalVictimId }` ensures all victim links are reassigned |

---

## Evidence: Test Coverage

**Test file:** `tests/unit/lib/party-merge.test.ts`

### Test: "should reassign PartyLinks to survivor" (lines 126-140)

```typescript
it("should reassign PartyLinks to survivor", async () => {
  await executeMerge(survivorId, victimId);

  // All links should now point to survivor
  const victimLinks = await db.partyLink.findMany({
    where: { partyId: victimId },
  });
  expect(victimLinks).toHaveLength(0);  // ✅ No stale victim links

  // Survivor should have all links
  const survivorLinks = await db.partyLink.findMany({
    where: { partyId: survivorId },
  });
  expect(survivorLinks.length).toBeGreaterThan(0);  // ✅ Links reassigned to survivor
});
```

### Test: "should handle nested merges correctly" (lines 388-411)

Verifies that PartyLinks are correctly reassigned through chained merges:

```typescript
// First merge: victim -> survivor
await executeMerge(survivorId, victimId);

// Second merge: party3 -> victim (which is now merged into survivor)
await executeMerge(survivorId, partyId3);

// Survivor should have all links (3 total)
const survivorLinks = await db.partyLink.findMany({
  where: { partyId: survivorId },
});
expect(survivorLinks.length).toBe(3);  // ✅ All links accumulated on survivor
```

---

## Code Change Required

**None.** The implementation already satisfies the roadmap requirement.

---

## TypeScript Compilation Result

```bash
$ npx tsc --noEmit
```

**Result:** ✅ **Clean** — No compilation errors

---

## Test Suite Result

### Party Merge Tests
```bash
$ npx vitest run tests/unit/lib/party-merge.test.ts
```

| Metric | Value |
|--------|-------|
| Test Files | 1 passed |
| Tests | 22 passed |
| Duration | 4.13s |

### Full Test Suite
```bash
$ npx vitest run
```

| Metric | Value |
|--------|-------|
| Test Files | 38 passed |
| Tests | 737 passed |
| Duration | 116.92s |

---

## Architecture Documentation Synchronization

### Outdated Statement (Corrected)

The `erp-architecture-map.md` contained outdated information:

| Location | Old Statement | Correction |
|----------|--------------|------------|
| Section 7, INV-12 | "`resolveFinalParty()` traversal only (P3-08 will fix PartyLink records atomically)" | PartyLink records **are** updated atomically inside `executeMerge()` transaction |
| Section 8, PartyLink mirror | "MEDIUM — not updated on merge" | PartyLink **is** updated on merge — reassigned to survivor atomically |

---

## Summary

P3-08 was analyzed and found to be **already implemented**. The `executeMerge()` function in `lib/party/services/party-merge.ts` correctly updates `PartyLink` records atomically within the same `db.$transaction()` that marks the victim party as merged.

**Key implementation details:**
- PartyLink reassignment uses `tx.partyLink.updateMany()` inside the transaction
- All victim PartyLinks are reassigned to the survivor in a single atomic operation
- No stale PartyLink references to the victim remain after merge
- Tests verify both the reassignment and absence of stale links

**No code changes were required.** This task was a documentation synchronization to align the roadmap and architecture map with the actual implementation state.

---

## Related Documentation

- Roadmap: `.qoder/specs/erp-normalization-roadmap.md`
- Architecture Map: `.qoder/specs/erp-architecture-map.md` (updated to reflect actual behavior)
- Implementation: `lib/party/services/party-merge.ts`
- Tests: `tests/unit/lib/party-merge.test.ts`

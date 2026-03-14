# Phase 2 Status Update — P2-03

**Date:** 2026-03-14  
**Author:** Implementation pass  
**Scope:** Production code change + documentation sync

---

## Summary

P2-03 required emitting a `discount.updated` outbox event inside the same `db.$transaction` as every `ProductDiscount` write. The discounts route had two write handlers (POST — create, DELETE — soft-delete). Neither used a transaction before this change. Both now do.

---

## Why P2-03 is complete

File changed: `app/api/accounting/products/[id]/discounts/route.ts`

Two write paths exist in this route:

1. **POST** — creates a new `ProductDiscount` row
2. **DELETE** — soft-deletes a `ProductDiscount` row by setting `isActive: false`

Both now:
- wrap the DB write in `db.$transaction(async (tx) => { ... })`
- emit `createOutboxEvent(tx, { type: "discount.updated", occurredAt: new Date(), payload: { productId } }, "ProductDiscount", productId)` using the same `tx` — inside the same transaction boundary

The `discount.updated` handler (`onProductCatalogUpdated`) was already registered in both execution paths before this change. No handler registration changes were needed.

---

## Old flow vs new flow

### POST — create discount

**Before:**
```
db.productDiscount.create(...)   ← bare call, no transaction
                                 ← no outbox event emitted
```

**After:**
```
db.$transaction(async (tx) => {
  tx.productDiscount.create(...)           ← write
  createOutboxEvent(tx, "discount.updated") ← outbox, same tx
})
```

### DELETE — deactivate discount

**Before:**
```
await params  ← params resolved but result discarded (productId never extracted)
db.productDiscount.update({ isActive: false })  ← bare call, no transaction
                                                ← no outbox event emitted
```

**After:**
```
const { id: productId } = await params   ← productId correctly extracted
db.$transaction(async (tx) => {
  tx.productDiscount.update({ isActive: false })   ← write
  createOutboxEvent(tx, "discount.updated")         ← outbox, same tx
})
```

---

## Transaction boundary confirmation

Both POST and DELETE use `db.$transaction(async (tx) => { ... })`.

Inside each transaction:
- The `ProductDiscount` mutation uses `tx` (same connection)
- `createOutboxEvent(tx, ...)` uses `tx` (same connection)

If the mutation fails, the outbox event is not written. If the outbox write fails, the mutation is rolled back. The projection cannot fall behind due to a failed event write.

---

## Handler registration — already present

`discount.updated` was registered before this change in both processors:

| File | Line | Registration |
|------|------|-------------|
| `app/api/system/outbox/process/route.ts` | 50 | `registerOutboxHandler("discount.updated", onProductCatalogUpdated)` |
| `scripts/process-outbox.ts` | 38 | `registerOutboxHandler("discount.updated", onProductCatalogUpdated)` |

`onProductCatalogUpdated` calls `updateProductCatalogProjection(productId)` — full re-read/upsert, idempotent.

---

## Incidental fix: `productId` extraction in DELETE

The original DELETE handler had:

```ts
await params;   // result discarded — productId never bound
```

This was a pre-existing latent bug. `productId` was never extracted, which meant it could not be included in the outbox event payload. The fix — `const { id: productId } = await params` — was a necessary prerequisite for emitting the event with the correct payload, not an unrelated change.

No other production code was modified.

---

## Confirmation: files touched

| File | Change |
|------|--------|
| `app/api/accounting/products/[id]/discounts/route.ts` | Added `createOutboxEvent` import; wrapped POST write in `db.$transaction`; wrapped DELETE write in `db.$transaction`; fixed `productId` extraction in DELETE |
| `.qoder/specs/erp-normalization-roadmap.md` | P2-03 task marked ✅ _Complete_; risk note updated to retired |
| `.qoder/specs/p2-03-status-update.md` | This file |

No other files were touched. P2-04 has not been started.

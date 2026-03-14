# Phase 2 Status Update — P2-01 and P2-02

**Date:** 2026-03-14  
**Author:** Code verification pass (no production code modified)  
**Scope:** Documentation and progress tracking sync only

---

## Summary

P2-01 and P2-02 were found to be already fully implemented in the codebase prior to any implementation session in this phase. This document records the verification evidence and the corresponding documentation corrections.

---

## P2-01 — `product.updated` outbox event

**Status: ✅ Complete**

### Evidence

File: `app/api/accounting/products/[id]/route.ts`, lines 58–92

```ts
// P2-01: product.update + outbox event are atomic — both inside one transaction.
const product = await db.$transaction(async (tx) => {
  const updated = await tx.product.update({ where: { id }, data: { ... } });

  await createOutboxEvent(
    tx,
    { type: "product.updated", occurredAt: new Date(), payload: { productId: id } },
    "Product",
    id
  );

  return updated;
});
```

`tx.product.update` and `createOutboxEvent(tx, ...)` share a single `db.$transaction`. The outbox write uses the same `tx` connection — atomic with the mutation.

### Handler registrations verified in:

- `app/api/system/outbox/process/route.ts` line 48:  
  `registerOutboxHandler("product.updated", onProductCatalogUpdated)`
- `scripts/process-outbox.ts` line 36:  
  `registerOutboxHandler("product.updated", onProductCatalogUpdated)`

Both registries are identical.

### Roadmap success criterion met:
> Every product/price/discount mutation route emits the corresponding outbox event.

---

## P2-02 — `sale_price.updated` outbox event

**Status: ✅ Complete**

### Evidence

File: `app/api/accounting/products/[id]/route.ts`, lines 102–118

```ts
// P2-02 (inline): salePrice mutation via this route also emits sale_price.updated.
// There is no dedicated /api/accounting/prices/sale route — salePrice lives here.
if (salePrice !== undefined) {
  await db.$transaction(async (tx) => {
    await tx.salePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } });
    if (salePrice != null && salePrice !== "") {
      await tx.salePrice.create({ data: { productId: id, price: parseFloat(String(salePrice)), isActive: true } });
    }
    await createOutboxEvent(
      tx,
      { type: "sale_price.updated", occurredAt: new Date(), payload: { productId: id } },
      "SalePrice",
      id
    );
  });
}
```

The `SalePrice` write and `createOutboxEvent(tx, ...)` are inside a single `db.$transaction`. The gate `if (salePrice !== undefined)` ensures this block only executes when the caller explicitly sends `salePrice` in the request body — correctly isolated from P2-01.

### Handler registrations verified in:

- `app/api/system/outbox/process/route.ts` line 49:  
  `registerOutboxHandler("sale_price.updated", onProductCatalogUpdated)`
- `scripts/process-outbox.ts` line 37:  
  `registerOutboxHandler("sale_price.updated", onProductCatalogUpdated)`

### Overlap behavior (when both fields are sent in one PUT request):

If a single request includes both product metadata fields and `salePrice`, two outbox events are emitted: `product.updated` + `sale_price.updated`. Both map to the same `onProductCatalogUpdated` handler. The handler calls `updateProductCatalogProjection(productId)`, which is a full re-read/upsert — idempotent. The projection reaches correct final state regardless of event processing order.

There is no projection trigger gap in this scenario.

---

## Roadmap Corrections Applied

File corrected: `.qoder/specs/erp-normalization-roadmap.md`

### 1. P2-01 task wording
**Before:**  
> In `app/api/accounting/products/[id]/route.ts` (PUT handler): after `db.product.update()`, emit ... Requires the product `update` to be moved into a transaction block if not already.

**After:**  
Updated to reflect completed state: `tx.product.update()` and `createOutboxEvent(tx, ...)` share a single `db.$transaction`. Task marked ✅ _Complete_.

### 2. P2-02 task wording
**Before:**  
> In `app/api/accounting/prices/sale/route.ts` (and the inline price update in `products/[id]/route.ts`): emit ...

**After:**  
Removed the reference to `app/api/accounting/prices/sale/route.ts`. That file **does not exist** (verified: no match in the codebase). The correct statement is that sale price mutation for a product lives entirely inline in `app/api/accounting/products/[id]/route.ts`, gated by `if (salePrice !== undefined)`. Task marked ✅ _Complete_.

### 3. Phase 2 Scope list
**Before:**  
`app/api/accounting/prices/sale/route.ts` listed as a scope target.

**After:**  
Struck through with a note: _(file does not exist; sale price mutation lives inline in `products/[id]/route.ts` — see P2-02)_

### 4. Phase 2 Risks section
**Before:**  
> **P2-01/02/03:** Product mutation routes currently do not use `db.$transaction()`. Adding transaction scope may affect performance...

**After:**  
Split into:
- **P2-01/02:** _(Risk retired — both already implemented with `db.$transaction()`. No performance change pending.)_
- **P2-03:** Risk language retained, scoped to the discount route only.

---

## Confirmation: No Production Code Modified

This update touched only:

| File | Change type |
|------|-------------|
| `.qoder/specs/erp-normalization-roadmap.md` | Documentation wording corrections + task status markers |
| `.qoder/specs/p2-status-update.md` | New file (this document) |

No files under `app/`, `lib/`, `prisma/`, `scripts/`, or `tests/` were touched.

---

## Next Step (not started)

**P2-03** — Emit `discount.updated` outbox event on every discount mutation.  
Target file: `app/api/accounting/products/[id]/discounts/route.ts`  
Awaiting explicit instruction to begin.

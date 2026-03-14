# Phase 2 Status Update — P2-05

**Date:** 2026-03-14  
**Author:** Implementation pass  
**Scope:** Production code change + documentation sync

---

## Summary

P2-05 required ensuring every new guest Customer created in the quick-order flow gets a Party mirror at creation time. The call to `resolveParty()` has been added to `app/api/ecommerce/orders/quick-order/route.ts`, gated to newly created customers only, with graceful degradation on failure.

---

## Why P2-05 is complete

File changed: `app/api/ecommerce/orders/quick-order/route.ts`

- `resolveParty({ customerId: customer.id })` is now called immediately after `db.customer.create()` returns, for newly created guest customers only
- The call is wrapped in a `try/catch` that logs failure without re-throwing
- `import { resolveParty } from "@/lib/party"` added to imports
- `const isNewCustomer = !customer` flag introduced before the `if (!customer)` branch to correctly gate the call

---

## Old flow vs new flow

**Before:**
```
db.customer.findFirst({ phone })
  → found:     use existing customer          ← no Party check
  → not found: db.customer.create(...)        ← no Party created
createSalesOrderFromCart(...)
→ return { orderNumber, totalAmount }
```

**After:**
```
db.customer.findFirst({ phone })
  → isNewCustomer = !customer
  → not found: db.customer.create(...)        (isNewCustomer = true)
if isNewCustomer:
  try {
    resolveParty({ customerId: customer.id }) ← Party mirror created
  } catch (partyError) {
    logger.error(...)                         ← logged, NOT re-thrown
  }
createSalesOrderFromCart(...)
→ return { orderNumber, totalAmount }
```

---

## resolveParty() called only for newly created guest customers

The `isNewCustomer` flag is `!customer` — it is `true` only when `db.customer.findFirst()` returned `null` and `db.customer.create()` ran. When a guest customer with the same phone number already exists, `isNewCustomer` is `false` and `resolveParty()` is not called. Returning customers either already have a Party from a prior order or will be caught by the backfill script.

This differs structurally from P2-04 in one way: there is no "update existing customer" branch here — a found customer is used as-is. So the flag is simply `!customer` rather than requiring a dedicated `else` path. The logic is equivalent in effect.

---

## Quick-order flow does not fail if Party creation fails

The `resolveParty()` call is inside a `try/catch`. On any error:
- `logger.error("quick-order", "Party mirror creation failed for new guest Customer — will be backfilled", { customerId, error })` is called
- The error is **not re-thrown**
- `createSalesOrderFromCart()` runs normally with the new Customer
- The order is placed and the response returns `{ orderNumber, totalAmount }`

The comment in the code explicitly marks this intent:
```ts
// Intentionally not re-throwing: order must proceed even if Party creation fails.
```

---

## Customer + Party are NOT created in the same transaction

This is a confirmed and intentional limitation — identical to P2-04.

`resolveParty()` uses the global `db` client throughout. Its creation path (`createPartyWithLinks`) opens its own internal `db.$transaction`. It cannot accept a `tx` parameter from an outer transaction. Attempting to call it inside a `db.$transaction` from this route would cause Prisma to nest interactive transactions, which is not supported.

`db.customer.create()` commits before `resolveParty()` is called. A crash between the two leaves an orphaned Customer without a Party. This is explicitly accepted per roadmap and mitigated by the backfill path.

---

## Reliability note — guest Customer → Party improves from MISSING to MEDIUM

| | Before P2-05 | After P2-05 |
|---|---|---|
| Guest Customer → Party (INV-02) | MISSING — no Party ever created at quick-order time | MEDIUM — attempted at creation time; failure logged and backfillable |

**Why not STRONG:**  
STRONG enforcement requires the Customer write and Party write to be in a single atomic transaction. That is not currently possible without making `resolveParty()` transaction-aware (accepting a Prisma `tx` parameter) or wrapping both operations in a dedicated `createCustomerWithParty()` service.

**What MEDIUM means in practice:**  
- A guest Customer without a Party can only occur if `resolveParty()` throws during the quick-order request
- That failure is logged with `customerId` — it is observable and actionable
- The backfill script targeting `Customer` records without a matching `PartyLink` can recover all such cases
- The synthetic `telegramId` (`quick_${timestamp}_${random}`) means the resolver hint must be `{ customerId }`, not `{ telegramId }` — this is the correct hint and is what the implementation uses

---

## Path to STRONG enforcement (future requirement)

Same two options as documented in P2-04:

**Option A — tx-aware `resolveParty()`:**  
Add a `tx?` parameter to `resolveParty()` and all helper functions it calls (`findPartyLink`, `resolveFinalParty`, `createPartyWithLinks`). When `tx` is provided, use it instead of the global `db` client. This would allow callers to include the Party write in their own `db.$transaction()`.

**Option B — Dedicated `createCustomerWithParty()` service:**  
Create a dedicated application service (mirroring `createCounterpartyWithParty()`) that encapsulates the compensating-transaction pattern with explicit rollback semantics. Both auth and quick-order routes would call this service instead of `db.customer.create()` directly. This does not require `resolveParty()` to be tx-aware but makes the invariant enforcement a named, tested unit.

Either option would raise INV-02 to STRONG for both Telegram auth and quick-order flows. Neither is in scope for the current P2 phase.

---

## Confirmation: files touched

| File | Change |
|------|--------|
| `app/api/ecommerce/orders/quick-order/route.ts` | Added `resolveParty` import; added `isNewCustomer` flag; added `try/catch` Party creation block after guest customer create |
| `.qoder/specs/erp-normalization-roadmap.md` | P2-05 task marked ✅ _Complete_ with reliability note; P2-05 risk entry retired |
| `.qoder/specs/p2-05-status-update.md` | This file |

No other files were touched. P2-06 has not been started.

# Phase 2 Status Update — P2-04

**Date:** 2026-03-14  
**Author:** Implementation pass  
**Scope:** Production code change + documentation sync

---

## Summary

P2-04 required ensuring every new Customer created in the Telegram auth flow gets a Party mirror at creation time. The call to `resolveParty()` has been added to `app/api/auth/customer/telegram/route.ts`, gated to new customers only, with graceful degradation on failure.

---

## Why P2-04 is complete

File changed: `app/api/auth/customer/telegram/route.ts`

- `resolveParty({ customerId: customer.id })` is now called immediately after `db.customer.create()` returns, for new customers only
- The call is wrapped in a `try/catch` that logs failure without re-throwing
- `import { resolveParty } from "@/lib/party"` added to imports

---

## Old flow vs new flow

**Before:**
```
db.customer.findUnique()
  → existing: db.customer.update()
  → new:      db.customer.create()       ← no Party created
isActive check
→ sign session, return cookie
```

**After:**
```
db.customer.findUnique()
  → existing: db.customer.update()       (isNewCustomer = false)
  → new:      db.customer.create()       (isNewCustomer = true)
isActive check
if isNewCustomer:
  try {
    resolveParty({ customerId: customer.id })   ← Party mirror created
  } catch (partyError) {
    logger.error(...)    ← logged, NOT re-thrown
  }
→ sign session, return cookie
```

---

## resolveParty() called only for new customers

The `isNewCustomer` flag is set to `true` only inside the `else` branch where `db.customer.create()` runs. Returning customers (the `update` path) either already have a Party from a previous login or will be caught by the backfill script. Calling `resolveParty()` on every login would add unnecessary DB queries to every auth request.

---

## Auth does not fail if Party creation fails

The `resolveParty()` call is inside a `try/catch`. On any error:
- `logger.error("telegram-auth", "Party mirror creation failed for new Customer — will be backfilled", { customerId, error })` is called
- The error is **not re-thrown**
- Execution continues to session creation and cookie response
- The user is logged in normally

The comment in the code explicitly marks this intent:
```ts
// Intentionally not re-throwing: login must succeed even if Party creation fails.
```

---

## Customer + Party are NOT created in the same transaction

This is a confirmed and intentional limitation.

`resolveParty()` uses the global `db` client throughout — in its lookup path (`findPartyLink`, `resolveFinalParty`) and in its creation path (`createPartyWithLinks`), which opens its own internal `db.$transaction`. It cannot accept a `tx` parameter from an outer transaction. Attempting to call it inside a `db.$transaction` from this route would cause Prisma to nest interactive transactions, which is not supported.

The same constraint is documented in `lib/modules/accounting/services/counterparty.service.ts` lines 67–74:

> *"resolveParty() is not Prisma-transaction-aware (it uses the global db client). We create the Counterparty first, then immediately resolve the Party within a try block."*

`createCounterpartyWithParty()` uses a compensating-delete pattern for that constraint. Here, the roadmap explicitly chose a different trade-off: let the Customer survive on Party failure and allow backfill, because blocking auth is a worse failure mode than a missing Party.

---

## Reliability note — INV-02 is now MEDIUM, not STRONG

| Before P2-04 | After P2-04 |
|---|---|
| MISSING — Party was never created at auth time; only created lazily on first order (if at all) | MEDIUM — Party is attempted at creation time; failure is logged and backfillable |

**Why not STRONG:**  
STRONG enforcement requires the Customer write and Party write to be in a single atomic transaction. That is not currently possible without making `resolveParty()` transaction-aware (accepting a Prisma `tx` parameter) or wrapping both operations in a dedicated atomic identity service.

**What MEDIUM means in practice:**  
- A new Customer without a Party can only occur if `resolveParty()` throws during auth
- That failure is logged with `customerId` — it is observable and actionable
- The backfill script (`scripts/backfill-party-counterparties.ts` or an equivalent targeting Customers without a `PartyLink`) can recover all such cases
- The window between Customer creation and Party creation is limited to a single HTTP request's duration

---

## Path to STRONG enforcement (future requirement)

Two options exist, neither scheduled in the current roadmap:

**Option A — tx-aware `resolveParty()`:**  
Add a `tx?` parameter to `resolveParty()` and all helper functions it calls (`findPartyLink`, `resolveFinalParty`, `createPartyWithLinks`). When `tx` is provided, use it instead of the global `db` client. This would allow callers to include the Party write in their own `db.$transaction()`.

**Option B — Atomic identity service:**  
Create a dedicated `createCustomerWithParty()` application service (mirroring `createCounterpartyWithParty()`) that encapsulates the compensating-transaction pattern with explicit rollback semantics. This does not require `resolveParty()` to be tx-aware but makes the invariant enforcement a named, tested unit.

Either option would raise INV-02 to STRONG. Neither is in scope for the current P2 phase.

---

## Confirmation: files touched

| File | Change |
|------|--------|
| `app/api/auth/customer/telegram/route.ts` | Added `resolveParty` import; added `isNewCustomer` flag; added `try/catch` Party creation block after `isActive` check |
| `.qoder/specs/erp-normalization-roadmap.md` | P2-04 task marked ✅ _Complete_ with reliability note; P2-04 risk entry retired; P2-05 risk entry split out |
| `.qoder/specs/p2-04-status-update.md` | This file |

No other files were touched. P2-05 has not been started.

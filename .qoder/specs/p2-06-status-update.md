# Phase 2 Status Update — P2-06

**Date:** 2026-03-14  
**Author:** Implementation pass  
**Scope:** Production code change + documentation sync

---

## Summary

P2-06 required removing `IEventBus` handler registration from the production startup path. The only file changed was `lib/bootstrap/domain-events.ts`. All test infrastructure was intentionally preserved. The outbox system was already the sole production event delivery mechanism before this change; P2-06 makes that contract explicit and enforced.

---

## Why P2-06 is complete

File changed: `lib/bootstrap/domain-events.ts`

- Removed `import { eventBus } from "@/lib/events"`
- Removed `import { registerAccountingHandlers } from "@/lib/modules/accounting/register-handlers"`
- Replaced `bootstrapDomainEvents()` body with an explicit no-op comment
- Retained the function signature and `bootstrapped` guard so `instrumentation.ts` requires no changes

---

## Old flow vs new flow

**Before (production boot):**
```
Next.js startup
  → instrumentation.ts: register()
      → bootstrapDomainEvents()
          → registerAccountingHandlers(eventBus)
              → eventBus.register("DocumentConfirmed", onDocumentConfirmedBalance)
              → eventBus.register("DocumentConfirmed", onDocumentConfirmedJournal)
              → eventBus.register("DocumentConfirmed", onDocumentConfirmedPayment)

[process lifetime]
  eventBus singleton: 3 handlers registered in-memory, never invoked
  (eventBus.publish() was called nowhere in production code)
```

**After (production boot):**
```
Next.js startup
  → instrumentation.ts: register()
      → bootstrapDomainEvents()
          → no-op (bootstrapped = true, return)

[process lifetime]
  eventBus singleton: 0 handlers registered, never imported in production
```

`instrumentation.ts` is unchanged — it still calls `bootstrapDomainEvents()` as a stable startup hook. The function now immediately returns after setting the guard flag.

---

## No production path uses IEventBus — confirmed

Pre-change grep scan results (exhaustive):

| Pattern searched | Matches in production code |
|---|---|
| `eventBus.publish(...)` | 0 |
| `import.*eventBus` outside bootstrap | 0 |
| `registerAccountingHandlers` outside its definition | 1 — `domain-events.ts` only (now removed) |
| `bootstrapDomainEvents` outside its definition | 1 — `instrumentation.ts` only (unchanged) |

`publishDocumentConfirmed()` in `document-confirm.service.ts` was already a confirmed no-op stub marked DEPRECATED before this change — it did not call `eventBus.publish()`.

The `eventBus` singleton export still exists in `lib/events/event-bus.ts` and is re-exported by `lib/events/index.ts`, but it is no longer imported by any production code. It is an unused export pending cleanup in a future phase.

---

## Outbox is now the sole production event delivery mechanism — confirmed

All `DocumentConfirmed` events are written via `createOutboxEvent(tx, ...)` atomically inside `confirmDocumentTransactional()` in `lib/modules/accounting/services/document-confirm.service.ts` (lines 322–340), in the same `db.$transaction` as the document status update.

Those outbox events are processed by two independent workers, both pre-existing before P2-06:

| Worker | File | Trigger |
|---|---|---|
| Cron endpoint | `app/api/system/outbox/process/route.ts` | Scheduled HTTP POST |
| CLI worker | `scripts/process-outbox.ts` | Manual / scheduled shell invocation |

Both workers register the same three handlers via `registerOutboxHandler()`:

```ts
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedBalance);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedJournal);
registerOutboxHandler("DocumentConfirmed", onDocumentConfirmedPayment);
```

These registrations were already in place before P2-06. No handler coverage gap was introduced by removing the `IEventBus` wiring.

The same workers also cover product catalog events (`product.updated`, `sale_price.updated`, `discount.updated`) registered in previous phases.

---

## Test infrastructure was intentionally preserved

The following were explicitly NOT changed:

| Item | Reason preserved |
|---|---|
| `lib/events/event-bus.ts` — `IEventBus`, `InProcessEventBus`, `eventBus` singleton, `createEventBus()` | `createEventBus()` is used by `tests/unit/lib/event-bus.test.ts` |
| `lib/modules/accounting/register-handlers.ts` — `registerAccountingHandlers()` | Valid test utility; may be used in future integration test scenarios |
| `lib/events/index.ts` — exports of `eventBus`, `IEventBus`, `createEventBus` | Removing would break existing test imports |

The `event-bus.test.ts` suite uses `createEventBus()` (isolated factory) exclusively — it never touches the singleton or `registerAccountingHandlers`. No test file was affected by this change and no test update was required. This was the specific risk the roadmap identified for P2-06; it was not realized.

---

## Event-bus code deferred cleanup note

The following items remain in the codebase as test/support infrastructure. They are not dead code risks for correctness, but they are production-unused exports:

- `eventBus` singleton in `lib/events/event-bus.ts` (line 84)
- `export { eventBus, createEventBus }` in `lib/events/index.ts` (line 7)
- `lib/modules/accounting/register-handlers.ts` — the file and its function

Cleanup (removal of the singleton export from the production barrel, or the entire file if no test uses it directly) is deferred. P4-07 (`tsc --noEmit` dead-export CI gate) would surface these as warnings once implemented.

---

## Confirmation: files touched

| File | Change |
|---|---|
| `lib/bootstrap/domain-events.ts` | Removed `eventBus` and `registerAccountingHandlers` imports; replaced body with no-op; updated JSDoc |
| `.qoder/specs/erp-normalization-roadmap.md` | P2-06 task marked ✅ _Complete_ with full implementation description; P2-06 risk entry retired |
| `.qoder/specs/p2-06-status-update.md` | This file |

No other files were touched. P2-07 has not been started.

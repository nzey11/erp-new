/**
 * Bootstrap — Domain Event wiring
 *
 * P2-06: This function is intentionally a no-op.
 *
 * The IEventBus / registerAccountingHandlers() wiring has been removed from
 * the production boot path. All production event delivery now goes through
 * the transactional outbox (lib/events/outbox.ts), processed by:
 *   - app/api/system/outbox/process/route.ts  (cron endpoint)
 *   - scripts/process-outbox.ts               (CLI worker)
 *
 * IEventBus and InProcessEventBus are retained for unit tests only.
 * createEventBus() is the test-safe factory (see tests/unit/lib/event-bus.test.ts).
 *
 * Do NOT re-add handler registrations here without a Phase decision.
 */

// Guard against double-registration remains as a safety net in case
// this function is ever re-populated in a future phase.
let bootstrapped = false;

export function bootstrapDomainEvents(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  // No-op: production event delivery uses the outbox, not the in-process bus.
}

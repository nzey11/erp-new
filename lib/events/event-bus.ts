/**
 * In-Process Event Bus — Phase 1.5 implementation.
 *
 * @deprecated This file is retained for unit tests only.
 * Production code uses the transactional outbox (lib/events/outbox.ts).
 * Do not use eventBus singleton in production — use createOutboxEvent() instead.
 *
 * Design contract:
 *   - IEventBus is the stable interface. Handlers are written against it.
 *   - InProcessEventBus is the current backing implementation.
 *
 * Handler isolation:
 *   - Each handler runs in its own try/catch inside publish().
 *   - Failure of one handler does NOT prevent others from running.
 *   - Errors are logged but not re-thrown (best-effort delivery).
 */

import type { DomainEvent } from "./types";
import { logger } from "@/lib/shared/logger";

// ─── Public interface (the swap point for Phase 2.1) ───────────────────────

export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;

export interface IEventBus {
  /**
   * Register a handler for a specific event type.
   * Call once at app startup — not per-request.
   */
  register<T extends DomainEvent>(
    eventType: T["type"],
    handler: EventHandler<T>
  ): void;

  /**
   * Publish an event to all registered handlers.
   * Resolves when all handlers have settled (success or caught error).
   *
   * Async contract: in-process runs handlers inline;
   * outbox implementation (Phase 2.1) will write to DB here.
   */
  publish(event: DomainEvent): Promise<void>;
}

// ─── In-process implementation ─────────────────────────────────────────────

class InProcessEventBus implements IEventBus {
  private readonly handlers = new Map<string, EventHandler<DomainEvent>[]>();

  register<T extends DomainEvent>(
    eventType: T["type"],
    handler: EventHandler<T>
  ): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as EventHandler<DomainEvent>);
    this.handlers.set(eventType, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        logger.error(
          "event-bus",
          `Handler failed for event "${event.type}"`,
          { err, eventType: event.type }
        );
      }
    }
  }
}

// ─── Module-level singleton ─────────────────────────────────────────────────
//
// Typed as IEventBus so nothing outside this file depends on InProcessEventBus.
// To swap the backing in Phase 2.1: change the assignment here only.

export const eventBus: IEventBus = new InProcessEventBus();

/**
 * Factory for creating isolated bus instances in tests.
 * Never use this in production code — use the `eventBus` singleton instead.
 */
export function createEventBus(): IEventBus {
  return new InProcessEventBus();
}

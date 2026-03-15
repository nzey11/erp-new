/**
 * Unit tests: InProcessEventBus behavior
 *
 * Uses createEventBus() factory to get a fresh, isolated bus per test —
 * never touches the production singleton or the registered accounting handlers.
 *
 * Covered:
 *   1. All registered handlers are called on publish
 *   2. One handler throwing does not block the remaining handlers
 */

import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "@/lib/events/event-bus";
import type { DocumentConfirmedEvent } from "@/lib/events/types";

// ─── Fixture ───────────────────────────────────────────────────────────────

function makeConfirmedEvent(documentId = "doc-1"): DocumentConfirmedEvent {
  return {
    type: "DocumentConfirmed",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    payload: {
      documentId,
      documentType: "incoming_shipment",
      documentNumber: "SHP-000001",
      counterpartyId: "cp-1",
      warehouseId: "wh-1",
      totalAmount: 5000,
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      confirmedBy: "user-1",
      tenantId: "tenant-1",
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("InProcessEventBus", () => {
  it("calls all registered handlers when an event is published", async () => {
    const bus = createEventBus();

    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    const handler3 = vi.fn().mockResolvedValue(undefined);

    bus.register("DocumentConfirmed", handler1);
    bus.register("DocumentConfirmed", handler2);
    bus.register("DocumentConfirmed", handler3);

    await bus.publish(makeConfirmedEvent());

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();

    // Verify each handler received the event payload
    const event = makeConfirmedEvent();
    const received = handler1.mock.calls[0][0] as DocumentConfirmedEvent;
    expect(received.type).toBe("DocumentConfirmed");
    expect(received.payload.documentId).toBe(event.payload.documentId);
  });

  it("continues calling remaining handlers when one handler throws", async () => {
    const bus = createEventBus();

    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockRejectedValue(new Error("handler 2 exploded"));
    const handler3 = vi.fn().mockResolvedValue(undefined);

    bus.register("DocumentConfirmed", handler1);
    bus.register("DocumentConfirmed", handler2);
    bus.register("DocumentConfirmed", handler3);

    // publish must not throw even when a handler rejects
    await expect(bus.publish(makeConfirmedEvent())).resolves.toBeUndefined();

    // All three handlers were invoked despite the failure of handler2
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();
  });
});

/**
 * Unit tests: Outbox Service
 *
 * Tests the outbox pattern implementation for durable event delivery.
 * Uses mocked database to verify the atomic claim and retry logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database before importing the service
const mockOutboxEvent = {
  create: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  groupBy: vi.fn(),
};

vi.mock("@/lib/shared/db", () => ({
  db: {
    outboxEvent: mockOutboxEvent,
    $queryRaw: vi.fn(),
  },
}));

// Import after mock is set up
const {
  createOutboxEvent,
  markOutboxProcessed,
  markOutboxFailed,
  getOutboxStats,
} = await import("@/lib/events/outbox");

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const mockTx = {
  outboxEvent: mockOutboxEvent,
} as unknown as Parameters<Parameters<typeof import("@/lib/shared/db").db.$transaction>[0]>[0];

const sampleEvent = {
  type: "DocumentConfirmed" as const,
  occurredAt: new Date("2026-03-13T10:00:00Z"),
  payload: {
    documentId: "doc-123",
    documentType: "incoming_shipment" as const,
    documentNumber: "SHP-001",
    counterpartyId: "cp-1",
    warehouseId: "wh-1",
    totalAmount: 5000,
    confirmedAt: new Date("2026-03-13T10:00:00Z"),
    confirmedBy: "user-1",
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Outbox Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOutboxEvent", () => {
    it("should create an outbox event with PENDING status", async () => {
      mockOutboxEvent.create.mockResolvedValueOnce({ id: "outbox-1" });

      await createOutboxEvent(mockTx, sampleEvent, "Document", "doc-123");

      expect(mockOutboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: "DocumentConfirmed",
          aggregateType: "Document",
          aggregateId: "doc-123",
          payload: sampleEvent,
          status: "PENDING",
          attempts: 0,
          availableAt: expect.any(Date),
        },
      });
    });
  });

  describe("markOutboxProcessed", () => {
    it("should update status to PROCESSED and set processedAt", async () => {
      mockOutboxEvent.update.mockResolvedValueOnce({ id: "outbox-1" });

      await markOutboxProcessed("outbox-1");

      expect(mockOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: "outbox-1" },
        data: {
          status: "PROCESSED",
          processedAt: expect.any(Date),
        },
      });
    });
  });

  describe("markOutboxFailed", () => {
    it("should increment attempts and schedule retry when under max retries", async () => {
      mockOutboxEvent.findUnique.mockResolvedValueOnce({ attempts: 1 });
      mockOutboxEvent.update.mockResolvedValueOnce({ id: "outbox-1" });

      await markOutboxFailed("outbox-1", new Error("Handler failed"));

      expect(mockOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: "outbox-1" },
        data: {
          status: "PENDING",
          attempts: 2,
          availableAt: expect.any(Date),
          lastError: "Handler failed",
        },
      });
    });

    it("should mark as FAILED when max retries exceeded", async () => {
      mockOutboxEvent.findUnique.mockResolvedValueOnce({ attempts: 5 });
      mockOutboxEvent.update.mockResolvedValueOnce({ id: "outbox-1" });

      await markOutboxFailed("outbox-1", new Error("Handler failed"));

      expect(mockOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: "outbox-1" },
        data: {
          status: "FAILED",
          attempts: 6,
          lastError: "Handler failed",
        },
      });
    });

    it("should do nothing if event not found", async () => {
      mockOutboxEvent.findUnique.mockResolvedValueOnce(null);

      await markOutboxFailed("nonexistent", new Error("Test"));

      expect(mockOutboxEvent.update).not.toHaveBeenCalled();
    });
  });

  describe("getOutboxStats", () => {
    it("should return counts by status", async () => {
      mockOutboxEvent.groupBy.mockResolvedValueOnce([
        { status: "PENDING", _count: 5 },
        { status: "PROCESSED", _count: 100 },
        { status: "FAILED", _count: 2 },
      ]);
      mockOutboxEvent.findFirst.mockResolvedValueOnce({ createdAt: new Date("2024-01-01") });

      const stats = await getOutboxStats();

      expect(stats).toEqual({
        pending: 5,
        processing: 0,
        processed: 100,
        failed: 2,
        oldestPendingAt: new Date("2024-01-01"),
      });
    });

    it("should return zeros when no events", async () => {
      mockOutboxEvent.groupBy.mockResolvedValueOnce([]);
      mockOutboxEvent.findFirst.mockResolvedValueOnce(null);

      const stats = await getOutboxStats();

      expect(stats).toEqual({
        pending: 0,
        processing: 0,
        processed: 0,
        failed: 0,
        oldestPendingAt: undefined,
      });
    });
  });
});

/**
 * Unit tests: payment-handler idempotency
 *
 * Proves that the payment handler's `documentId` guard works correctly:
 * a second DocumentConfirmed publish for the same document must NOT
 * create a second Payment record.
 *
 * All DB calls are mocked — no real database involved.
 *
 * Covered:
 *   1. First publish → payment.create is called once
 *   2. Second publish for the same documentId → payment.create is NOT called again
 *   3. Publish for a non-shipment document type → payment.create is NOT called at all
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentConfirmedEvent } from "@/lib/events/types";

// ─── Mock @/lib/shared/db before importing the handler ─────────────────────

const mockDb = {
  financeCategory: {
    findFirst: vi.fn(),
  },
  payment: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  paymentCounter: {
    update: vi.fn(),
  },
  document: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/shared/db", () => ({ db: mockDb }));

// Import handler AFTER mock is set up
const { onDocumentConfirmedPayment } = await import(
  "@/lib/modules/accounting/handlers/payment-handler"
);

// ─── Fixture ───────────────────────────────────────────────────────────────

function makeShipmentEvent(
  documentId = "doc-shipment-1",
  documentType: "incoming_shipment" | "outgoing_shipment" = "incoming_shipment"
): DocumentConfirmedEvent {
  return {
    type: "DocumentConfirmed",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    payload: {
      documentId,
      documentType,
      documentNumber: "SHP-000001",
      counterpartyId: "cp-1",
      warehouseId: "wh-1",
      totalAmount: 5000,
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      confirmedBy: "user-1",
    },
  };
}

// ─── Shared mock defaults ───────────────────────────────────────────────────

const FAKE_CATEGORY = { id: "cat-1" };
const FAKE_COUNTER = { prefix: "PAY", lastNumber: 42 };
const FAKE_DOCUMENT = { paymentType: "bank_transfer" };
const FAKE_PAYMENT = { id: "payment-already-exists" };

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("onDocumentConfirmedPayment — idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path setup
    mockDb.financeCategory.findFirst.mockResolvedValue(FAKE_CATEGORY);
    mockDb.paymentCounter.update.mockResolvedValue(FAKE_COUNTER);
    mockDb.document.findUnique.mockResolvedValue(FAKE_DOCUMENT);
    mockDb.payment.create.mockResolvedValue({ id: "new-payment" });
  });

  it("creates a payment on first publish (no existing payment)", async () => {
    mockDb.payment.findFirst.mockResolvedValue(null); // no existing payment

    await onDocumentConfirmedPayment(makeShipmentEvent("doc-1"));

    expect(mockDb.payment.create).toHaveBeenCalledOnce();
  });

  it("does NOT create a second payment when payment already exists for the same documentId", async () => {
    mockDb.payment.findFirst.mockResolvedValue(FAKE_PAYMENT); // existing payment found

    await onDocumentConfirmedPayment(makeShipmentEvent("doc-1"));

    // Guard must short-circuit before calling create
    expect(mockDb.payment.create).not.toHaveBeenCalled();
  });

  it("does NOT create a payment for non-shipment document types", async () => {
    const nonShipmentEvent: DocumentConfirmedEvent = {
      ...makeShipmentEvent("doc-2"),
      payload: {
        ...makeShipmentEvent("doc-2").payload,
        documentType: "stock_receipt",
      },
    };

    await onDocumentConfirmedPayment(nonShipmentEvent);

    expect(mockDb.financeCategory.findFirst).not.toHaveBeenCalled();
    expect(mockDb.payment.create).not.toHaveBeenCalled();
  });
});

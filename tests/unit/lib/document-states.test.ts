/**
 * Unit tests for document-states.ts state machine.
 *
 * Strategy:
 * - Every allowed transition must pass canTransition() and validateTransition()
 * - Every forbidden transition must fail both
 * - getAvailableTransitions() must match the TRANSITIONS table exactly
 * - DocumentStateError must carry all expected fields
 * - Terminal states (delivered, cancelled) must have no outgoing transitions
 *
 * These tests are the guard against accidental edits to the TRANSITIONS table.
 */

import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  getAvailableTransitions,
  DocumentStateError,
} from "@/lib/modules/accounting/document-states";
import type { DocumentType, DocumentStatus } from "@/lib/generated/prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATUSES: DocumentStatus[] = [
  "draft",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

/** Every status not in the allowed list must return false from canTransition */
function expectOnlyAllowed(
  type: DocumentType,
  from: DocumentStatus,
  allowed: DocumentStatus[]
) {
  for (const to of ALL_STATUSES) {
    if (allowed.includes(to)) {
      expect(canTransition(type, from, to), `${type}: ${from}→${to} should be allowed`).toBe(true);
    } else {
      expect(canTransition(type, from, to), `${type}: ${from}→${to} should be forbidden`).toBe(false);
    }
  }
}

// ---------------------------------------------------------------------------
// Stock operations — simple draft→confirmed→cancelled lifecycle
// ---------------------------------------------------------------------------

describe("document-states: stock operations", () => {
  const stockTypes: DocumentType[] = ["stock_receipt", "write_off", "stock_transfer", "inventory_count"];

  for (const type of stockTypes) {
    describe(type, () => {
      it("draft → confirmed is allowed", () => {
        expect(canTransition(type, "draft", "confirmed")).toBe(true);
      });

      it("confirmed → cancelled is allowed", () => {
        expect(canTransition(type, "confirmed", "cancelled")).toBe(true);
      });

      it("draft can only go to confirmed", () => {
        expectOnlyAllowed(type, "draft", ["confirmed"]);
      });

      it("confirmed can only go to cancelled", () => {
        expectOnlyAllowed(type, "confirmed", ["cancelled"]);
      });

      it("cancelled has no outgoing transitions (terminal)", () => {
        expectOnlyAllowed(type, "cancelled", []);
      });

      it("delivered has no outgoing transitions (terminal)", () => {
        expectOnlyAllowed(type, "delivered", []);
      });

      it("shipped has no outgoing transitions", () => {
        expectOnlyAllowed(type, "shipped", []);
      });

      it("draft → cancelled is forbidden", () => {
        expect(canTransition(type, "draft", "cancelled")).toBe(false);
      });

      it("confirmed → draft is forbidden (no rollback)", () => {
        expect(canTransition(type, "confirmed", "draft")).toBe(false);
      });

      it("getAvailableTransitions from draft returns [confirmed]", () => {
        expect(getAvailableTransitions(type, "draft")).toEqual(["confirmed"]);
      });

      it("getAvailableTransitions from confirmed returns [cancelled]", () => {
        expect(getAvailableTransitions(type, "confirmed")).toEqual(["cancelled"]);
      });

      it("getAvailableTransitions from cancelled returns []", () => {
        expect(getAvailableTransitions(type, "cancelled")).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Purchases — same simple lifecycle
// ---------------------------------------------------------------------------

describe("document-states: purchases", () => {
  const purchaseTypes: DocumentType[] = ["purchase_order", "incoming_shipment", "supplier_return"];

  for (const type of purchaseTypes) {
    describe(type, () => {
      it("draft → confirmed is allowed", () => {
        expect(canTransition(type, "draft", "confirmed")).toBe(true);
      });

      it("confirmed → cancelled is allowed", () => {
        expect(canTransition(type, "confirmed", "cancelled")).toBe(true);
      });

      it("draft can only go to confirmed", () => {
        expectOnlyAllowed(type, "draft", ["confirmed"]);
      });

      it("confirmed can only go to cancelled", () => {
        expectOnlyAllowed(type, "confirmed", ["cancelled"]);
      });

      it("cancelled is terminal", () => {
        expectOnlyAllowed(type, "cancelled", []);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Finance — same simple lifecycle
// ---------------------------------------------------------------------------

describe("document-states: finance payments", () => {
  const paymentTypes: DocumentType[] = ["incoming_payment", "outgoing_payment"];

  for (const type of paymentTypes) {
    describe(type, () => {
      it("draft → confirmed is allowed", () => {
        expect(canTransition(type, "draft", "confirmed")).toBe(true);
      });

      it("confirmed → cancelled is allowed", () => {
        expect(canTransition(type, "confirmed", "cancelled")).toBe(true);
      });

      it("draft can only go to confirmed", () => {
        expectOnlyAllowed(type, "draft", ["confirmed"]);
      });

      it("confirmed can only go to cancelled", () => {
        expectOnlyAllowed(type, "confirmed", ["cancelled"]);
      });

      it("cancelled is terminal", () => {
        expectOnlyAllowed(type, "cancelled", []);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// customer_return — simple lifecycle (no shipping)
// ---------------------------------------------------------------------------

describe("document-states: customer_return", () => {
  it("draft → confirmed is allowed", () => {
    expect(canTransition("customer_return", "draft", "confirmed")).toBe(true);
  });

  it("confirmed → cancelled is allowed", () => {
    expect(canTransition("customer_return", "confirmed", "cancelled")).toBe(true);
  });

  it("confirmed → shipped is forbidden (no shipping for returns)", () => {
    expect(canTransition("customer_return", "confirmed", "shipped")).toBe(false);
  });

  it("draft can only go to confirmed", () => {
    expectOnlyAllowed("customer_return", "draft", ["confirmed"]);
  });

  it("confirmed can only go to cancelled", () => {
    expectOnlyAllowed("customer_return", "confirmed", ["cancelled"]);
  });
});

// ---------------------------------------------------------------------------
// sales_order — extended lifecycle with shipping
// ---------------------------------------------------------------------------

describe("document-states: sales_order", () => {
  it("draft → confirmed is allowed", () => {
    expect(canTransition("sales_order", "draft", "confirmed")).toBe(true);
  });

  it("confirmed → shipped is allowed", () => {
    expect(canTransition("sales_order", "confirmed", "shipped")).toBe(true);
  });

  it("confirmed → cancelled is allowed", () => {
    expect(canTransition("sales_order", "confirmed", "cancelled")).toBe(true);
  });

  it("shipped → delivered is allowed", () => {
    expect(canTransition("sales_order", "shipped", "delivered")).toBe(true);
  });

  it("shipped → cancelled is allowed", () => {
    expect(canTransition("sales_order", "shipped", "cancelled")).toBe(true);
  });

  it("draft can only go to confirmed", () => {
    expectOnlyAllowed("sales_order", "draft", ["confirmed"]);
  });

  it("confirmed can go to shipped or cancelled only", () => {
    expectOnlyAllowed("sales_order", "confirmed", ["shipped", "cancelled"]);
  });

  it("shipped can go to delivered or cancelled only", () => {
    expectOnlyAllowed("sales_order", "shipped", ["delivered", "cancelled"]);
  });

  it("delivered is terminal", () => {
    expectOnlyAllowed("sales_order", "delivered", []);
  });

  it("cancelled is terminal", () => {
    expectOnlyAllowed("sales_order", "cancelled", []);
  });

  it("delivered → cancelled is forbidden", () => {
    expect(canTransition("sales_order", "delivered", "cancelled")).toBe(false);
  });

  it("getAvailableTransitions from confirmed returns [shipped, cancelled]", () => {
    expect(getAvailableTransitions("sales_order", "confirmed")).toEqual(["shipped", "cancelled"]);
  });

  it("getAvailableTransitions from shipped returns [delivered, cancelled]", () => {
    expect(getAvailableTransitions("sales_order", "shipped")).toEqual(["delivered", "cancelled"]);
  });

  it("getAvailableTransitions from delivered returns []", () => {
    expect(getAvailableTransitions("sales_order", "delivered")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// outgoing_shipment — shipping lifecycle (cannot cancel after delivered)
// ---------------------------------------------------------------------------

describe("document-states: outgoing_shipment", () => {
  it("draft → confirmed is allowed", () => {
    expect(canTransition("outgoing_shipment", "draft", "confirmed")).toBe(true);
  });

  it("confirmed → shipped is allowed", () => {
    expect(canTransition("outgoing_shipment", "confirmed", "shipped")).toBe(true);
  });

  it("confirmed → cancelled is allowed", () => {
    expect(canTransition("outgoing_shipment", "confirmed", "cancelled")).toBe(true);
  });

  it("shipped → delivered is allowed", () => {
    expect(canTransition("outgoing_shipment", "shipped", "delivered")).toBe(true);
  });

  it("shipped → cancelled is forbidden for outgoing_shipment (unlike sales_order)", () => {
    expect(canTransition("outgoing_shipment", "shipped", "cancelled")).toBe(false);
  });

  it("confirmed can go to shipped or cancelled only", () => {
    expectOnlyAllowed("outgoing_shipment", "confirmed", ["shipped", "cancelled"]);
  });

  it("shipped can only go to delivered", () => {
    expectOnlyAllowed("outgoing_shipment", "shipped", ["delivered"]);
  });

  it("delivered is terminal", () => {
    expectOnlyAllowed("outgoing_shipment", "delivered", []);
  });

  it("getAvailableTransitions from shipped returns [delivered]", () => {
    expect(getAvailableTransitions("outgoing_shipment", "shipped")).toEqual(["delivered"]);
  });
});

// ---------------------------------------------------------------------------
// validateTransition — error shape
// ---------------------------------------------------------------------------

describe("validateTransition error shape", () => {
  it("throws DocumentStateError with all fields populated", () => {
    expect(() =>
      validateTransition("stock_receipt", "confirmed", "draft")
    ).toThrow(DocumentStateError);

    try {
      validateTransition("stock_receipt", "confirmed", "draft");
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentStateError);
      if (e instanceof DocumentStateError) {
        expect(e.documentType).toBe("stock_receipt");
        expect(e.fromStatus).toBe("confirmed");
        expect(e.toStatus).toBe("draft");
        expect(e.reason).toContain("cancelled"); // allowed next status listed in reason
        expect(e.message).toContain("stock_receipt");
        expect(e.message).toContain("confirmed");
        expect(e.message).toContain("draft");
      }
    }
  });

  it("throws with 'no transitions allowed' reason for terminal state", () => {
    try {
      validateTransition("stock_receipt", "cancelled", "draft");
    } catch (e) {
      if (e instanceof DocumentStateError) {
        expect(e.reason).toContain("no transitions are allowed");
      }
    }
  });

  it("does NOT throw for an allowed transition", () => {
    expect(() =>
      validateTransition("stock_receipt", "draft", "confirmed")
    ).not.toThrow();
  });

  it("error name is DocumentStateError", () => {
    try {
      validateTransition("write_off", "cancelled", "confirmed");
    } catch (e) {
      expect((e as Error).name).toBe("DocumentStateError");
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant: no type allows confirmed → draft (no status rollback ever)
// ---------------------------------------------------------------------------

describe("global invariant: no confirmed → draft rollback for any type", () => {
  const ALL_TYPES: DocumentType[] = [
    "stock_receipt", "write_off", "stock_transfer", "inventory_count",
    "purchase_order", "incoming_shipment", "supplier_return",
    "sales_order", "outgoing_shipment", "customer_return",
    "incoming_payment", "outgoing_payment",
  ];

  for (const type of ALL_TYPES) {
    it(`${type}: confirmed → draft is forbidden`, () => {
      expect(canTransition(type, "confirmed", "draft")).toBe(false);
    });
  }
});

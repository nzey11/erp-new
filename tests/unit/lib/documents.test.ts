import { describe, it, expect } from "vitest";
import {
  affectsStock,
  affectsBalance,
  isStockIncrease,
  isStockDecrease,
  isInventoryCount,
  getDocTypeName,
  getDocStatusName,
  getDocTypePrefix,
  requiresWarehouse,
  requiresCounterparty,
  isPaymentType,
  STOCK_INCREASE_TYPES,
  STOCK_DECREASE_TYPES,
  BALANCE_AFFECTING_TYPES,
} from "@/lib/modules/accounting/documents";

describe("lib/documents", () => {
  describe("affectsStock", () => {
    it("should return true for stock_receipt", () => {
      expect(affectsStock("stock_receipt")).toBe(true);
    });

    it("should return true for write_off", () => {
      expect(affectsStock("write_off")).toBe(true);
    });

    it("should return true for incoming_shipment", () => {
      expect(affectsStock("incoming_shipment")).toBe(true);
    });

    it("should return true for outgoing_shipment", () => {
      expect(affectsStock("outgoing_shipment")).toBe(true);
    });

    it("should return true for stock_transfer", () => {
      expect(affectsStock("stock_transfer")).toBe(true);
    });

    it("should return false for inventory_count (uses linked docs instead)", () => {
      expect(affectsStock("inventory_count")).toBe(false);
    });

    it("should return true for customer_return", () => {
      expect(affectsStock("customer_return")).toBe(true);
    });

    it("should return true for supplier_return", () => {
      expect(affectsStock("supplier_return")).toBe(true);
    });

    it("should return false for incoming_payment", () => {
      expect(affectsStock("incoming_payment")).toBe(false);
    });

    it("should return false for outgoing_payment", () => {
      expect(affectsStock("outgoing_payment")).toBe(false);
    });

    it("should return false for purchase_order", () => {
      expect(affectsStock("purchase_order")).toBe(false);
    });

    it("should return false for sales_order", () => {
      expect(affectsStock("sales_order")).toBe(false);
    });
  });

  describe("affectsBalance", () => {
    it("should return true for incoming_shipment", () => {
      expect(affectsBalance("incoming_shipment")).toBe(true);
    });

    it("should return true for outgoing_shipment", () => {
      expect(affectsBalance("outgoing_shipment")).toBe(true);
    });

    it("should return true for incoming_payment", () => {
      expect(affectsBalance("incoming_payment")).toBe(true);
    });

    it("should return true for outgoing_payment", () => {
      expect(affectsBalance("outgoing_payment")).toBe(true);
    });

    it("should return true for customer_return", () => {
      expect(affectsBalance("customer_return")).toBe(true);
    });

    it("should return true for supplier_return", () => {
      expect(affectsBalance("supplier_return")).toBe(true);
    });

    it("should return false for stock_receipt", () => {
      expect(affectsBalance("stock_receipt")).toBe(false);
    });

    it("should return false for write_off", () => {
      expect(affectsBalance("write_off")).toBe(false);
    });

    it("should return false for stock_transfer", () => {
      expect(affectsBalance("stock_transfer")).toBe(false);
    });
  });

  describe("isStockIncrease", () => {
    it("should return true for stock_receipt", () => {
      expect(isStockIncrease("stock_receipt")).toBe(true);
    });

    it("should return true for incoming_shipment", () => {
      expect(isStockIncrease("incoming_shipment")).toBe(true);
    });

    it("should return true for customer_return", () => {
      expect(isStockIncrease("customer_return")).toBe(true);
    });

    it("should return false for write_off", () => {
      expect(isStockIncrease("write_off")).toBe(false);
    });

    it("should return false for outgoing_shipment", () => {
      expect(isStockIncrease("outgoing_shipment")).toBe(false);
    });
  });

  describe("isStockDecrease", () => {
    it("should return true for write_off", () => {
      expect(isStockDecrease("write_off")).toBe(true);
    });

    it("should return true for outgoing_shipment", () => {
      expect(isStockDecrease("outgoing_shipment")).toBe(true);
    });

    it("should return true for supplier_return", () => {
      expect(isStockDecrease("supplier_return")).toBe(true);
    });

    it("should return false for stock_receipt", () => {
      expect(isStockDecrease("stock_receipt")).toBe(false);
    });

    it("should return false for incoming_shipment", () => {
      expect(isStockDecrease("incoming_shipment")).toBe(false);
    });
  });

  describe("getDocTypeName", () => {
    it("should return Russian name for stock_receipt", () => {
      expect(getDocTypeName("stock_receipt")).toBe("Оприходование");
    });

    it("should return Russian name for outgoing_shipment", () => {
      expect(getDocTypeName("outgoing_shipment")).toBe("Отгрузка");
    });

    it("should return Russian name for incoming_payment", () => {
      expect(getDocTypeName("incoming_payment")).toBe("Входящий платёж");
    });
  });

  describe("getDocStatusName", () => {
    it("should return Russian name for draft", () => {
      expect(getDocStatusName("draft")).toBe("Черновик");
    });

    it("should return Russian name for confirmed", () => {
      expect(getDocStatusName("confirmed")).toBe("Подтверждён");
    });

    it("should return Russian name for cancelled", () => {
      expect(getDocStatusName("cancelled")).toBe("Отменён");
    });
  });

  describe("getDocTypePrefix", () => {
    it("should return prefix for stock_receipt", () => {
      expect(getDocTypePrefix("stock_receipt")).toBe("ОП");
    });

    it("should return prefix for outgoing_shipment", () => {
      expect(getDocTypePrefix("outgoing_shipment")).toBe("ОТ");
    });

    it("should return prefix for incoming_payment", () => {
      expect(getDocTypePrefix("incoming_payment")).toBe("ВхП");
    });
  });

  describe("requiresWarehouse", () => {
    it("should return true for stock_receipt", () => {
      expect(requiresWarehouse("stock_receipt")).toBe(true);
    });

    it("should return true for outgoing_shipment", () => {
      expect(requiresWarehouse("outgoing_shipment")).toBe(true);
    });

    it("should return false for incoming_payment", () => {
      expect(requiresWarehouse("incoming_payment")).toBe(false);
    });

    it("should return false for outgoing_payment", () => {
      expect(requiresWarehouse("outgoing_payment")).toBe(false);
    });
  });

  describe("requiresCounterparty", () => {
    it("should return true for incoming_shipment", () => {
      expect(requiresCounterparty("incoming_shipment")).toBe(true);
    });

    it("should return true for outgoing_shipment", () => {
      expect(requiresCounterparty("outgoing_shipment")).toBe(true);
    });

    it("should return true for incoming_payment", () => {
      expect(requiresCounterparty("incoming_payment")).toBe(true);
    });

    it("should return false for stock_receipt", () => {
      expect(requiresCounterparty("stock_receipt")).toBe(false);
    });

    it("should return false for write_off", () => {
      expect(requiresCounterparty("write_off")).toBe(false);
    });
  });

  describe("isPaymentType", () => {
    it("should return true for incoming_payment", () => {
      expect(isPaymentType("incoming_payment")).toBe(true);
    });

    it("should return true for outgoing_payment", () => {
      expect(isPaymentType("outgoing_payment")).toBe(true);
    });

    it("should return false for outgoing_shipment", () => {
      expect(isPaymentType("outgoing_shipment")).toBe(false);
    });

    it("should return false for stock_receipt", () => {
      expect(isPaymentType("stock_receipt")).toBe(false);
    });
  });

  describe("isInventoryCount", () => {
    it("should return true for inventory_count", () => {
      expect(isInventoryCount("inventory_count")).toBe(true);
    });

    it("should return false for stock_receipt", () => {
      expect(isInventoryCount("stock_receipt")).toBe(false);
    });

    it("should return false for write_off", () => {
      expect(isInventoryCount("write_off")).toBe(false);
    });
  });

  describe("constants", () => {
    it("STOCK_INCREASE_TYPES should contain 3 types", () => {
      expect(STOCK_INCREASE_TYPES).toHaveLength(3);
      expect(STOCK_INCREASE_TYPES).toContain("stock_receipt");
      expect(STOCK_INCREASE_TYPES).toContain("incoming_shipment");
      expect(STOCK_INCREASE_TYPES).toContain("customer_return");
    });

    it("STOCK_DECREASE_TYPES should contain 3 types", () => {
      expect(STOCK_DECREASE_TYPES).toHaveLength(3);
      expect(STOCK_DECREASE_TYPES).toContain("write_off");
      expect(STOCK_DECREASE_TYPES).toContain("outgoing_shipment");
      expect(STOCK_DECREASE_TYPES).toContain("supplier_return");
    });

    it("BALANCE_AFFECTING_TYPES should contain 6 types", () => {
      expect(BALANCE_AFFECTING_TYPES).toHaveLength(6);
      expect(BALANCE_AFFECTING_TYPES).toContain("incoming_shipment");
      expect(BALANCE_AFFECTING_TYPES).toContain("outgoing_shipment");
      expect(BALANCE_AFFECTING_TYPES).toContain("incoming_payment");
      expect(BALANCE_AFFECTING_TYPES).toContain("outgoing_payment");
    });
  });
});

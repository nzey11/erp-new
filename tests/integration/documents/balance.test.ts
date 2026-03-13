import { describe, it, expect, beforeEach } from "vitest";
import { cleanDatabase } from "../../helpers/test-db";
import {
  createWarehouse,
  createCounterparty,
  createDocument,
} from "../../helpers/factories";
import { recalculateBalance, getBalance } from "@/lib/modules/finance/reports";

describe("lib/balance - integration", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe("recalculateBalance", () => {
    it("should return 0 for counterparty with no documents", async () => {
      const counterparty = await createCounterparty();

      const balance = await recalculateBalance(counterparty.id);

      expect(balance).toBe(0);
    });

    it("should increase balance (receivable) for outgoing_shipment", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Customer owes us 1000 RUB after shipment
      await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(1000); // Positive = they owe us
    });

    it("should decrease balance (payable) for incoming_shipment", async () => {
      const warehouse = await createWarehouse();
      const supplier = await createCounterparty({ type: "supplier" });

      // We owe supplier 500 RUB after receiving goods
      await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: supplier.id,
        totalAmount: 500,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(supplier.id);

      expect(balance).toBe(-500); // Negative = we owe them
    });

    it("should reduce receivable after incoming_payment", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Customer owes us 1000
      await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
      });

      // Customer pays 600
      await createDocument({
        type: "incoming_payment",
        status: "confirmed",
        counterpartyId: customer.id,
        totalAmount: 600,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(400); // 1000 - 600 = 400 (they still owe us)
    });

    it("should reduce payable after outgoing_payment", async () => {
      const warehouse = await createWarehouse();
      const supplier = await createCounterparty({ type: "supplier" });

      // We owe supplier 1000
      await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: supplier.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
      });

      // We pay them 800
      await createDocument({
        type: "outgoing_payment",
        status: "confirmed",
        counterpartyId: supplier.id,
        totalAmount: 800,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(supplier.id);

      expect(balance).toBe(-200); // -1000 + 800 = -200 (we still owe them)
    });

    it("should handle customer_return (reduces receivable)", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Shipped 1000
      await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
      });

      // Customer returned 200
      await createDocument({
        type: "customer_return",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 200,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(800); // 1000 - 200 = 800
    });

    it("should handle supplier_return (reduces payable)", async () => {
      const warehouse = await createWarehouse();
      const supplier = await createCounterparty({ type: "supplier" });

      // Received goods 1000
      await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: supplier.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
      });

      // Returned 300 to supplier
      await createDocument({
        type: "supplier_return",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: supplier.id,
        totalAmount: 300,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(supplier.id);

      expect(balance).toBe(-700); // -1000 + 300 = -700
    });

    it("should not count draft documents", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Draft shipment should not affect balance
      await createDocument({
        type: "outgoing_shipment",
        status: "draft",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1000,
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(0);
    });

    it("should not count cancelled documents", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Cancelled shipment should not affect balance
      await createDocument({
        type: "outgoing_shipment",
        status: "cancelled",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1000,
        confirmedAt: new Date(),
        cancelledAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(0);
    });

    it("should handle full payment cycle for customer", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Ship 5000
      await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 5000,
        confirmedAt: new Date(),
      });

      // Customer pays in full
      await createDocument({
        type: "incoming_payment",
        status: "confirmed",
        counterpartyId: customer.id,
        totalAmount: 5000,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(0); // Fully paid
    });

    it("should handle full payment cycle for supplier", async () => {
      const warehouse = await createWarehouse();
      const supplier = await createCounterparty({ type: "supplier" });

      // Receive goods 3000
      await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: supplier.id,
        totalAmount: 3000,
        confirmedAt: new Date(),
      });

      // Pay in full
      await createDocument({
        type: "outgoing_payment",
        status: "confirmed",
        counterpartyId: supplier.id,
        totalAmount: 3000,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(supplier.id);

      expect(balance).toBe(0); // Fully paid
    });

    it("should handle overpayment (prepayment)", async () => {
      await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      // Customer pays 500 in advance
      await createDocument({
        type: "incoming_payment",
        status: "confirmed",
        counterpartyId: customer.id,
        totalAmount: 500,
        confirmedAt: new Date(),
      });

      const balance = await recalculateBalance(customer.id);

      expect(balance).toBe(-500); // We owe them (prepayment)
    });
  });

  describe("getBalance", () => {
    it("should return 0 for counterparty with no balance record", async () => {
      const counterparty = await createCounterparty();

      const balance = await getBalance(counterparty.id);

      expect(balance).toBe(0);
    });

    it("should return correct balance after recalculation", async () => {
      const warehouse = await createWarehouse();
      const customer = await createCounterparty({ type: "customer" });

      await createDocument({
        type: "outgoing_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        counterpartyId: customer.id,
        totalAmount: 1500,
        confirmedAt: new Date(),
      });

      // First recalculate to create the balance record
      await recalculateBalance(customer.id);

      // Then get the balance
      const balance = await getBalance(customer.id);

      expect(balance).toBe(1500);
    });
  });
});

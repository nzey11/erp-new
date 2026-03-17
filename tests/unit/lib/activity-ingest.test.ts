/**
 * Unit tests for Activity Ingest service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/shared/db";
import { recordActivity, recordOrderPlaced, getPartyActivities } from "@/lib/domain/party/services/activity-ingest";
import { resolveParty } from "@/lib/domain/party/services/party-resolver";
import { createCustomer, createCounterparty } from "@/tests/helpers/factories";

describe("Activity Ingest", () => {
  beforeEach(async () => {
    await db.partyActivity.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
  });

  afterEach(async () => {
    await db.partyActivity.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
  });

  describe("recordActivity", () => {
    it("should create activity and update lastActivityAt", async () => {
      const customer = await createCustomer();

      const activity = await recordActivity({
        type: "order_placed",
        hints: { customerId: customer.id },
        sourceType: "document",
        sourceId: "doc-123",
        summary: { orderNumber: "ORD-001", totalAmount: 1000 },
      });

      expect(activity.type).toBe("order_placed");
      expect(activity.sourceId).toBe("doc-123");

      // Verify lastActivityAt was updated
      const party = await db.party.findUnique({
        where: { id: activity.partyId },
      });
      expect(party?.lastActivityAt).not.toBeNull();
    });

    it("should use explicit occurredAt timestamp", async () => {
      const customer = await createCustomer();
      const explicitDate = new Date("2024-01-15T10:00:00Z");

      const activity = await recordActivity({
        type: "order_placed",
        hints: { customerId: customer.id },
        sourceType: "document",
        sourceId: "doc-123",
        summary: {},
        occurredAt: explicitDate,
      });

      expect(activity.occurredAt.toISOString()).toBe(explicitDate.toISOString());
    });

    it("should create Party if not exists", async () => {
      const counterparty = await createCounterparty();

      const activity = await recordActivity({
        type: "payment_received",
        hints: { counterpartyId: counterparty.id },
        sourceType: "payment",
        sourceId: "pay-123",
        summary: { amount: 5000 },
      });

      // Verify Party was created
      const party = await db.party.findUnique({
        where: { id: activity.partyId },
      });
      expect(party).not.toBeNull();
      expect(party?.displayName).toBe(counterparty.name);
    });

    it("should only update lastActivityAt if newer", async () => {
      const customer = await createCustomer();
      const { partyId } = await resolveParty({ customerId: customer.id });

      // Set initial lastActivityAt
      const oldDate = new Date("2024-01-01T00:00:00Z");
      await db.party.update({
        where: { id: partyId },
        data: { lastActivityAt: oldDate },
      });

      // Record activity with even older date
      const olderDate = new Date("2023-12-01T00:00:00Z");
      await recordActivity({
        type: "order_placed",
        hints: { customerId: customer.id },
        sourceType: "document",
        sourceId: "doc-old",
        summary: {},
        occurredAt: olderDate,
      });

      // lastActivityAt should still be oldDate (the newer one)
      const party = await db.party.findUnique({ where: { id: partyId } });
      expect(party?.lastActivityAt?.getTime()).toBe(oldDate.getTime());
    });
  });

  describe("recordOrderPlaced", () => {
    it("should create order_placed activity with correct summary", async () => {
      const customer = await createCustomer();

      const activity = await recordOrderPlaced({
        customerId: customer.id,
        documentId: "doc-456",
        orderNumber: "ORD-002",
        totalAmount: 5000,
      });

      expect(activity.type).toBe("order_placed");
      expect(activity.summary).toEqual({
        orderNumber: "ORD-002",
        totalAmount: 5000,
      });
    });
  });

  describe("getPartyActivities", () => {
    it("should return activities ordered by occurredAt desc", async () => {
      const customer = await createCustomer();
      const { partyId } = await resolveParty({ customerId: customer.id });

      // Create multiple activities
      await recordActivity({
        type: "order_placed",
        hints: { customerId: customer.id },
        sourceType: "document",
        sourceId: "doc-1",
        summary: {},
        occurredAt: new Date("2024-01-01"),
      });

      await recordActivity({
        type: "payment_received",
        hints: { customerId: customer.id },
        sourceType: "payment",
        sourceId: "pay-1",
        summary: {},
        occurredAt: new Date("2024-01-15"),
      });

      const activities = await getPartyActivities(partyId);

      expect(activities).toHaveLength(2);
      expect(activities[0].type).toBe("payment_received"); // Most recent first
      expect(activities[1].type).toBe("order_placed");
    });

    it("should filter by activity types", async () => {
      const customer = await createCustomer();
      const { partyId } = await resolveParty({ customerId: customer.id });

      await recordActivity({
        type: "order_placed",
        hints: { customerId: customer.id },
        sourceType: "document",
        sourceId: "doc-1",
        summary: {},
      });

      await recordActivity({
        type: "payment_received",
        hints: { customerId: customer.id },
        sourceType: "payment",
        sourceId: "pay-1",
        summary: {},
      });

      const activities = await getPartyActivities(partyId, {
        types: ["order_placed"],
      });

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe("order_placed");
    });
  });
});

/**
 * Unit tests for Party Owner service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  getOwner,
  getOwners,
  getOwnershipHistory,
  assignOwner,
  removeOwner,
  getPartiesByOwner,
  getPartyCountByOwner,
} from "@/lib/party/services/party-owner";
import { resolveParty } from "@/lib/party/services/party-resolver";
import { createCustomer, createUser } from "@/tests/helpers/factories";

describe("Party Owner Service", () => {
  let partyId: string;
  let userId: string;

  beforeEach(async () => {
    // Clean up Party-related tables
    await db.mergeRequest.deleteMany();
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
    await db.user.deleteMany();

    // Create test data
    const customer = await createCustomer();
    const user = await createUser();
    userId = user.id;

    const result = await resolveParty({ customerId: customer.id });
    partyId = result.partyId;
  });

  afterEach(async () => {
    await db.mergeRequest.deleteMany();
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
    await db.user.deleteMany();
  });

  describe("getOwner", () => {
    it("should return null when no owner assigned", async () => {
      const owner = await getOwner(partyId);
      expect(owner).toBeNull();
    });

    it("should return primary owner userId", async () => {
      await assignOwner(partyId, userId, { role: "primary" });

      const owner = await getOwner(partyId);
      expect(owner).toBe(userId);
    });
  });

  describe("getOwners", () => {
    it("should return empty array when no owners", async () => {
      const owners = await getOwners(partyId);
      expect(owners).toHaveLength(0);
    });

    it("should return all active owners", async () => {
      const user2 = await createUser();

      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId, user2.id, { role: "backup" });

      const owners = await getOwners(partyId);
      expect(owners).toHaveLength(2);
    });
  });

  describe("getOwnershipHistory", () => {
    it("should return ownership history including ended owners", async () => {
      const user2 = await createUser();

      // Assign first owner, then replace
      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId, user2.id, { role: "primary" });

      const history = await getOwnershipHistory(partyId);
      expect(history).toHaveLength(2);
    });
  });

  describe("assignOwner", () => {
    it("should assign primary owner and update denormalized field", async () => {
      const owner = await assignOwner(partyId, userId, { role: "primary" });

      expect(owner.partyId).toBe(partyId);
      expect(owner.userId).toBe(userId);
      expect(owner.role).toBe("primary");
      expect(owner.isActive).toBe(true);

      // Verify denormalized field
      const party = await db.party.findUnique({
        where: { id: partyId },
        select: { primaryOwnerUserId: true },
      });
      expect(party?.primaryOwnerUserId).toBe(userId);
    });

    it("should end previous owner of same role", async () => {
      const user2 = await createUser();

      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId, user2.id, { role: "primary" });

      // First owner should be ended
      const firstOwner = await db.partyOwner.findFirst({
        where: { partyId, userId, role: "primary" },
      });
      expect(firstOwner?.isActive).toBe(false);
      expect(firstOwner?.endedAt).not.toBeNull();

      // Second owner should be active
      const secondOwner = await db.partyOwner.findFirst({
        where: { partyId, userId: user2.id, role: "primary" },
      });
      expect(secondOwner?.isActive).toBe(true);
    });

    it("should allow multiple owners with different roles", async () => {
      const user2 = await createUser();

      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId, user2.id, { role: "backup" });

      const owners = await getOwners(partyId);
      expect(owners).toHaveLength(2);
    });

    it("should record assignedBy", async () => {
      const admin = await createUser({ role: "admin" });

      const owner = await assignOwner(partyId, userId, {
        role: "primary",
        assignedBy: admin.id,
      });

      expect(owner.assignedBy).toBe(admin.id);
    });
  });

  describe("removeOwner", () => {
    it("should remove owner and clear denormalized field", async () => {
      await assignOwner(partyId, userId, { role: "primary" });
      await removeOwner(partyId, userId);

      // Owner should be inactive
      const owner = await db.partyOwner.findFirst({
        where: { partyId, userId },
      });
      expect(owner?.isActive).toBe(false);

      // Denormalized field should be cleared
      const party = await db.party.findUnique({
        where: { id: partyId },
        select: { primaryOwnerUserId: true },
      });
      expect(party?.primaryOwnerUserId).toBeNull();
    });

    it("should not affect other owners", async () => {
      const user2 = await createUser();

      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId, user2.id, { role: "backup" });
      await removeOwner(partyId, userId);

      const owners = await getOwners(partyId);
      expect(owners).toHaveLength(1);
      expect(owners[0]?.userId).toBe(user2.id);
    });
  });

  describe("getPartiesByOwner", () => {
    it("should return parties owned by user", async () => {
      await assignOwner(partyId, userId, { role: "primary" });

      const parties = await getPartiesByOwner(userId);
      expect(parties).toHaveLength(1);
      expect(parties[0]?.id).toBe(partyId);
    });

    it("should respect limit and offset", async () => {
      // Create multiple parties
      const customer2 = await createCustomer({ name: "Customer 2" });
      const customer3 = await createCustomer({ name: "Customer 3" });

      const { partyId: partyId2 } = await resolveParty({ customerId: customer2.id });
      const { partyId: partyId3 } = await resolveParty({ customerId: customer3.id });

      await assignOwner(partyId, userId, { role: "primary" });
      await assignOwner(partyId2, userId, { role: "primary" });
      await assignOwner(partyId3, userId, { role: "primary" });

      const parties = await getPartiesByOwner(userId, { limit: 2 });
      expect(parties).toHaveLength(2);
    });

    it("should not return merged parties", async () => {
      await assignOwner(partyId, userId, { role: "primary" });

      // Mark party as merged
      await db.party.update({
        where: { id: partyId },
        data: { status: "merged" },
      });

      const parties = await getPartiesByOwner(userId);
      expect(parties).toHaveLength(0);
    });
  });

  describe("getPartyCountByOwner", () => {
    it("should return count of parties owned by user", async () => {
      await assignOwner(partyId, userId, { role: "primary" });

      const count = await getPartyCountByOwner(userId);
      expect(count).toBe(1);
    });

    it("should only count active parties", async () => {
      await assignOwner(partyId, userId, { role: "primary" });

      // Mark party as merged
      await db.party.update({
        where: { id: partyId },
        data: { status: "merged" },
      });

      const count = await getPartyCountByOwner(userId);
      expect(count).toBe(0);
    });
  });
});

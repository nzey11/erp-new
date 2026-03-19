/**
 * Unit tests for Party Merge service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  createMergeRequest,
  executeMerge,
  approveMergeRequest,
  rejectMergeRequest,
  getPendingMergeRequests,
  getMergeHistory,
} from "@/lib/domain/party/services/party-merge";
import { resolveParty } from "@/lib/domain/party/services/party-resolver";
import { assignOwner } from "@/lib/domain/party/services/party-owner";
import { createCustomer, createUser } from "@/tests/helpers/factories";

describe("Party Merge Service", () => {
  let survivorId: string;
  let victimId: string;
  let userId: string;

  beforeEach(async () => {
    // Clean up all Party-related tables
    await db.mergeRequest.deleteMany();
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
    await db.user.deleteMany();

    // Create test data
    const customer1 = await createCustomer({ name: "Customer 1" });
    const customer2 = await createCustomer({ name: "Customer 2" });
    const user = await createUser();
    userId = user.id;

    const result1 = await resolveParty({ customerId: customer1.id });
    const result2 = await resolveParty({ customerId: customer2.id });
    survivorId = result1.partyId;
    victimId = result2.partyId;
  });

  afterEach(async () => {
    await db.mergeRequest.deleteMany();
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
    await db.user.deleteMany();
  });

  describe("createMergeRequest", () => {
    it("should create a new merge request", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      expect(request.survivorId).toBe(survivorId);
      expect(request.victimId).toBe(victimId);
      expect(request.status).toBe("pending");
    });

    it("should throw error when survivor and victim are the same", async () => {
      await expect(
        createMergeRequest({
          survivorId,
          victimId: survivorId,
          detectionSource: "manual",
          createdBy: userId,
        })
      ).rejects.toThrow("Survivor and victim cannot be the same party");
    });

    it("should return existing request if already exists", async () => {
      const first = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      const second = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      expect(second.id).toBe(first.id);
    });

    it("should store detection metadata", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "fuzzy_match",
        confidence: 0.95,
        matchReason: "Similar name and phone",
        createdBy: userId,
      });

      expect(request.detectionSource).toBe("fuzzy_match");
      expect(request.confidence).toBe(0.95);
      expect(request.matchReason).toBe("Similar name and phone");
    });
  });

  describe("executeMerge", () => {
    it("should mark victim as merged", async () => {
      await executeMerge(survivorId, victimId);

      const victim = await db.party.findUnique({
        where: { id: victimId },
      });

      expect(victim?.status).toBe("merged");
      expect(victim?.mergedIntoId).toBe(survivorId);
      expect(victim?.mergedAt).not.toBeNull();
    });

    it("should reassign PartyLinks to survivor", async () => {
      await executeMerge(survivorId, victimId);

      // All links should now point to survivor
      const victimLinks = await db.partyLink.findMany({
        where: { partyId: victimId },
      });
      expect(victimLinks).toHaveLength(0);

      // Survivor should have all links
      const survivorLinks = await db.partyLink.findMany({
        where: { partyId: survivorId },
      });
      expect(survivorLinks.length).toBeGreaterThan(0);
    });

    it("should reassign owners to survivor if no conflict", async () => {
      const user1 = await createUser();
      await assignOwner(victimId, user1.id, { role: "primary" });

      await executeMerge(survivorId, victimId);

      const survivorOwners = await db.partyOwner.findMany({
        where: { partyId: survivorId, isActive: true },
      });
      expect(survivorOwners).toHaveLength(1);
      expect(survivorOwners[0]?.userId).toBe(user1.id);
    });

    it("should end victim owner if survivor has same role", async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      await assignOwner(survivorId, user1.id, { role: "primary" });
      await assignOwner(victimId, user2.id, { role: "primary" });

      await executeMerge(survivorId, victimId);

      // Survivor keeps its owner
      const survivorOwners = await db.partyOwner.findMany({
        where: { partyId: survivorId, isActive: true },
      });
      expect(survivorOwners).toHaveLength(1);
      expect(survivorOwners[0]?.userId).toBe(user1.id);

      // Victim owner should be ended
      const victimOwner = await db.partyOwner.findFirst({
        where: { partyId: victimId, userId: user2.id },
      });
      expect(victimOwner?.isActive).toBe(false);
    });

    it("should inherit denormalized fields from victim", async () => {
      // Create a new customer and link it only to victim
      const newCustomer = await createCustomer({ name: "New Customer" });
      const { partyId: victimOnlyParty } = await resolveParty({ customerId: newCustomer.id });
      
      // Clear survivor's customer
      await db.party.update({
        where: { id: survivorId },
        data: { primaryCustomerId: null },
      });
      
      // Set victim to have the new customer
      await db.party.update({
        where: { id: victimOnlyParty },
        data: { primaryCustomerId: newCustomer.id },
      });

      await executeMerge(survivorId, victimOnlyParty);

      const updatedSurvivor = await db.party.findUnique({
        where: { id: survivorId },
        select: { primaryCustomerId: true },
      });
      
      // Should have inherited from victim
      expect(updatedSurvivor?.primaryCustomerId).toBe(newCustomer.id);
    });

    it("should use most recent lastActivityAt", async () => {
      const recentDate = new Date("2024-03-01");
      const oldDate = new Date("2024-01-01");

      await db.party.update({
        where: { id: survivorId },
        data: { lastActivityAt: oldDate },
      });
      await db.party.update({
        where: { id: victimId },
        data: { lastActivityAt: recentDate },
      });

      await executeMerge(survivorId, victimId);

      const survivor = await db.party.findUnique({
        where: { id: survivorId },
        select: { lastActivityAt: true },
      });

      expect(survivor?.lastActivityAt?.getTime()).toBe(recentDate.getTime());
    });

    it("should throw error if survivor and victim resolve to same party", async () => {
      // Mark victim as already merged into survivor
      await db.party.update({
        where: { id: victimId },
        data: { status: "merged", mergedIntoId: survivorId },
      });

      await expect(
        executeMerge(survivorId, victimId)
      ).rejects.toThrow("Survivor and victim resolve to the same party");
    });

    it("should update merge request status if provided", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      await executeMerge(survivorId, victimId, request.id);

      const updated = await db.mergeRequest.findUnique({
        where: { id: request.id },
      });

      expect(updated?.status).toBe("executed");
      expect(updated?.executedAt).not.toBeNull();
    });
  });

  describe("approveMergeRequest", () => {
    it("should approve and execute merge request", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      await approveMergeRequest(request.id, userId);

      const updated = await db.mergeRequest.findUnique({
        where: { id: request.id },
      });

      expect(updated?.status).toBe("executed");
      expect(updated?.reviewedBy).toBe(userId);

      // Verify merge was executed
      const victim = await db.party.findUnique({
        where: { id: victimId },
      });
      expect(victim?.status).toBe("merged");
    });

    it("should throw error for non-existent request", async () => {
      await expect(
        approveMergeRequest("non-existent-id", userId)
      ).rejects.toThrow("Merge request not found");
    });

    it("should throw error for already processed request", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      await approveMergeRequest(request.id, userId);

      await expect(
        approveMergeRequest(request.id, userId)
      ).rejects.toThrow("Merge request is already executed");
    });
  });

  describe("rejectMergeRequest", () => {
    it("should reject merge request", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      await rejectMergeRequest(request.id, userId);

      const updated = await db.mergeRequest.findUnique({
        where: { id: request.id },
      });

      expect(updated?.status).toBe("rejected");
      expect(updated?.reviewedBy).toBe(userId);

      // Verify merge was NOT executed
      const victim = await db.party.findUnique({
        where: { id: victimId },
      });
      expect(victim?.status).toBe("active");
    });
  });

  describe("getPendingMergeRequests", () => {
    it("should return only pending requests", async () => {
      await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      const pending = await getPendingMergeRequests();
      expect(pending).toHaveLength(1);
    });

    it("should not include executed requests", async () => {
      const request = await createMergeRequest({
        survivorId,
        victimId,
        detectionSource: "manual",
        createdBy: userId,
      });

      await approveMergeRequest(request.id, userId);

      const pending = await getPendingMergeRequests();
      expect(pending).toHaveLength(0);
    });
  });

  describe("getMergeHistory", () => {
    it("should return empty history for non-merged party", async () => {
      const history = await getMergeHistory(survivorId);

      expect(history.mergedFrom).toHaveLength(0);
      expect(history.mergedInto).toBeNull();
    });

    it("should return mergedFrom after merge", async () => {
      await executeMerge(survivorId, victimId);

      const history = await getMergeHistory(survivorId);

      expect(history.mergedFrom).toHaveLength(1);
      expect(history.mergedFrom[0]?.id).toBe(victimId);
    });

    it("should return mergedInto for victim", async () => {
      await executeMerge(survivorId, victimId);

      const history = await getMergeHistory(victimId);

      expect(history.mergedInto).not.toBeNull();
      expect(history.mergedInto?.id).toBe(survivorId);
    });
  });

  describe("merge chain resolution", () => {
    it("should handle nested merges correctly", async () => {
      const customer3 = await createCustomer({ name: "Customer 3" });
      const { partyId: partyId3 } = await resolveParty({ customerId: customer3.id });

      // First merge: victim -> survivor
      await executeMerge(survivorId, victimId);

      // Second merge: party3 -> victim (which is now merged into survivor)
      await executeMerge(survivorId, partyId3);

      // party3 should be merged into survivor (not victim)
      const party3 = await db.party.findUnique({
        where: { id: partyId3 },
      });
      expect(party3?.mergedIntoId).toBe(survivorId);

      // Survivor should have all links
      const survivorLinks = await db.partyLink.findMany({
        where: { partyId: survivorId },
      });
      expect(survivorLinks.length).toBe(3);
    });
  });
});

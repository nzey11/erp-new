/**
 * Unit tests for Party Resolver service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/shared/db";
import {
  resolveParty,
  resolveFinalPartyId,
  resolveFinalParty,
  getPartyByCustomer,
  getPartyByCounterparty,
} from "@/lib/domain/party/services/party-resolver";
import { createCustomer, createCounterparty } from "@/tests/helpers/factories";

describe("Party Resolver", () => {
  beforeEach(async () => {
    // Clean up Party-related tables
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.partyActivity.deleteMany();
    await db.partyOwner.deleteMany();
    await db.partyLink.deleteMany();
    await db.party.deleteMany();
  });

  describe("resolveParty", () => {
    it("should create a new Party when no match found", async () => {
      const customer = await createCustomer();

      const result = await resolveParty({ customerId: customer.id });

      expect(result.isNew).toBe(true);
      expect(result.party.displayName).toBe(customer.name);
      expect(result.party.primaryCustomerId).toBe(customer.id);
    });

    it("should return existing Party when customerId matches", async () => {
      const customer = await createCustomer();

      // First resolution creates the party
      const first = await resolveParty({ customerId: customer.id });
      expect(first.isNew).toBe(true);

      // Second resolution should return the same party
      const second = await resolveParty({ customerId: customer.id });
      expect(second.isNew).toBe(false);
      expect(second.partyId).toBe(first.partyId);
    });

    it("should return existing Party when counterpartyId matches", async () => {
      const counterparty = await createCounterparty();

      const first = await resolveParty({ counterpartyId: counterparty.id });
      expect(first.isNew).toBe(true);

      const second = await resolveParty({ counterpartyId: counterparty.id });
      expect(second.isNew).toBe(false);
      expect(second.partyId).toBe(first.partyId);
    });

    it("should link Customer and Counterparty to same Party when both hints provided", async () => {
      const customer = await createCustomer();
      const counterparty = await createCounterparty();

      // Resolve with both hints
      const result = await resolveParty({
        customerId: customer.id,
        counterpartyId: counterparty.id,
      });

      expect(result.isNew).toBe(true);

      // Verify both links exist
      const customerLink = await db.partyLink.findUnique({
        where: {
          entityType_entityId: {
            entityType: "customer",
            entityId: customer.id,
          },
        },
      });
      expect(customerLink).not.toBeNull();
      expect(customerLink?.partyId).toBe(result.partyId);

      const counterpartyLink = await db.partyLink.findUnique({
        where: {
          entityType_entityId: {
            entityType: "counterparty",
            entityId: counterparty.id,
          },
        },
      });
      expect(counterpartyLink).not.toBeNull();
      expect(counterpartyLink?.partyId).toBe(result.partyId);
    });

    it("should find existing Party by telegramId", async () => {
      const customer = await createCustomer();

      // Create party first via customerId
      const first = await resolveParty({ customerId: customer.id });

      // Find via telegramId
      const second = await resolveParty({ telegramId: customer.telegramId });
      expect(second.isNew).toBe(false);
      expect(second.partyId).toBe(first.partyId);
    });
  });

  describe("resolveFinalPartyId", () => {
    it("should return same ID for non-merged party", async () => {
      const customer = await createCustomer();
      const { partyId } = await resolveParty({ customerId: customer.id });

      const finalId = await resolveFinalPartyId(partyId);
      expect(finalId).toBe(partyId);
    });

    it("should follow merge chain to survivor", async () => {
      const counterparty1 = await createCounterparty({ name: "CP1" });
      const counterparty2 = await createCounterparty({ name: "CP2" });

      const { partyId: survivorId } = await resolveParty({
        counterpartyId: counterparty1.id,
      });
      const { partyId: victimId } = await resolveParty({
        counterpartyId: counterparty2.id,
      });

      // Mark victim as merged
      await db.party.update({
        where: { id: victimId },
        data: { status: "merged", mergedIntoId: survivorId },
      });

      const finalId = await resolveFinalPartyId(victimId);
      expect(finalId).toBe(survivorId);
    });
  });

  describe("getPartyByCustomer", () => {
    it("should return Party for existing customer", async () => {
      const customer = await createCustomer();
      const { partyId } = await resolveParty({ customerId: customer.id });

      const party = await getPartyByCustomer(customer.id);
      expect(party).not.toBeNull();
      expect(party?.id).toBe(partyId);
    });

    it("should return null for non-existent customer", async () => {
      const party = await getPartyByCustomer("non-existent-id");
      expect(party).toBeNull();
    });
  });

  describe("getPartyByCounterparty", () => {
    it("should return Party for existing counterparty", async () => {
      const counterparty = await createCounterparty();
      const { partyId } = await resolveParty({ counterpartyId: counterparty.id });

      const party = await getPartyByCounterparty(counterparty.id);
      expect(party).not.toBeNull();
      expect(party?.id).toBe(partyId);
    });
  });
});

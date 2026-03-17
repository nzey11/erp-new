// =============================================
// PARTY RESOLVER: Identity Resolution Service
// =============================================

import { db } from "@/lib/shared/db";
import type { Party, PartyLink, PartyEntityType } from "@/lib/generated/prisma/client";
import type { PartyHints, ResolvedParty } from "../types";
import { Prisma } from "@/lib/generated/prisma/client";

// =============================================
// Main Resolver Function
// =============================================

/**
 * Resolves a Party from hints, creating a new one if necessary.
 * 
 * Resolution priority:
 * 1. Direct partyId match
 * 2. Customer ID match via PartyLink
 * 3. Counterparty ID match via PartyLink
 * 4. Telegram ID match (lookup Customer, then PartyLink)
 * 
 * @param hints - Identifiers to resolve from
 * @returns Resolved party with isNew flag
 */
export async function resolveParty(hints: PartyHints): Promise<ResolvedParty> {
  // 1. Direct party ID
  if (hints.partyId) {
    const party = await resolveFinalParty(hints.partyId);
    if (party) {
      return { partyId: party.id, isNew: false, party };
    }
  }

  // 2. Customer ID match
  if (hints.customerId) {
    const link = await findPartyLink("customer", hints.customerId);
    if (link) {
      const party = await resolveFinalParty(link.partyId);
      if (party) {
        return { partyId: party.id, isNew: false, party };
      }
    }
  }

  // 3. Counterparty ID match
  if (hints.counterpartyId) {
    const link = await findPartyLink("counterparty", hints.counterpartyId);
    if (link) {
      const party = await resolveFinalParty(link.partyId);
      if (party) {
        return { partyId: party.id, isNew: false, party };
      }
    }
  }

  // 4. Telegram ID match (lookup Customer first)
  if (hints.telegramId) {
    const customer = await db.customer.findUnique({
      where: { telegramId: hints.telegramId },
    });
    if (customer) {
      const link = await findPartyLink("customer", customer.id);
      if (link) {
        const party = await resolveFinalParty(link.partyId);
        if (party) {
          return { partyId: party.id, isNew: false, party };
        }
      }
    }
  }

  // No match found - create new Party
  // Use retry pattern to handle race conditions
  try {
    return await createPartyWithLinks(hints);
  } catch (error) {
    // Handle race condition: another request may have created the party
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Unique constraint violation - re-query to find the existing party
      // Retry resolution with the same hints
      if (hints.customerId) {
        const link = await findPartyLink("customer", hints.customerId);
        if (link) {
          const party = await resolveFinalParty(link.partyId);
          if (party) {
            return { partyId: party.id, isNew: false, party };
          }
        }
      }
      if (hints.counterpartyId) {
        const link = await findPartyLink("counterparty", hints.counterpartyId);
        if (link) {
          const party = await resolveFinalParty(link.partyId);
          if (party) {
            return { partyId: party.id, isNew: false, party };
          }
        }
      }
    }
    throw error;
  }
}

// =============================================
// Resolve Final Party (follow merge chain)
// =============================================

/**
 * Resolves the final party ID by following the merge chain.
 * If a party has been merged into another, returns the survivor.
 * 
 * Uses iterative approach to avoid stack overflow.
 */
export async function resolveFinalPartyId(partyId: string): Promise<string> {
  const party = await resolveFinalParty(partyId);
  return party?.id ?? partyId;
}

/**
 * Resolves the final party by following the merge chain.
 * Returns null if party not found.
 */
export async function resolveFinalParty(partyId: string): Promise<Party | null> {
  let currentId = partyId;
  let iterations = 0;
  const maxIterations = 10; // Safety limit

  while (iterations < maxIterations) {
    const party = await db.party.findUnique({
      where: { id: currentId },
    });

    if (!party) {
      return null;
    }

    // If not merged, this is the final party
    if (party.status !== "merged" || !party.mergedIntoId) {
      return party;
    }

    // Follow the merge chain
    currentId = party.mergedIntoId;
    iterations++;
  }

  // If we hit max iterations, return the last found party
  return db.party.findUnique({ where: { id: currentId } });
}

// =============================================
// Helper Functions
// =============================================

async function findPartyLink(
  entityType: PartyEntityType,
  entityId: string
): Promise<PartyLink | null> {
  return db.partyLink.findUnique({
    where: {
      entityType_entityId: { entityType, entityId },
    },
  });
}

async function createPartyWithLinks(hints: PartyHints): Promise<ResolvedParty> {
  // Determine display name
  let displayName = "Unknown";
  let type: "person" | "organization" = "person";

  // Try to get name from Customer
  if (hints.customerId) {
    const customer = await db.customer.findUnique({
      where: { id: hints.customerId },
    });
    if (customer?.name) {
      displayName = customer.name;
    }
  }

  // Try to get name from Counterparty
  if (hints.counterpartyId) {
    const counterparty = await db.counterparty.findUnique({
      where: { id: hints.counterpartyId },
    });
    if (counterparty?.name) {
      displayName = counterparty.name;
      // Counterparties are typically organizations
      type = counterparty.type === "customer" ? "person" : "organization";
    }
  }

  // Create Party with PartyLinks in a transaction
  const party = await db.$transaction(async (tx) => {
    const newParty = await tx.party.create({
      data: {
        displayName,
        type,
        // Set denormalized cache fields
        primaryCustomerId: hints.customerId,
        primaryCounterpartyId: hints.counterpartyId,
      },
    });

    // Create PartyLinks
    const linksToCreate: Array<{ entityType: PartyEntityType; entityId: string }> = [];

    if (hints.customerId) {
      linksToCreate.push({ entityType: "customer", entityId: hints.customerId });
    }
    if (hints.counterpartyId) {
      linksToCreate.push({ entityType: "counterparty", entityId: hints.counterpartyId });
    }

    for (const link of linksToCreate) {
      await tx.partyLink.create({
        data: {
          partyId: newParty.id,
          entityType: link.entityType,
          entityId: link.entityId,
          isPrimary: true,
        },
      });
    }

    return newParty;
  });

  return { partyId: party.id, isNew: true, party };
}

// =============================================
// Get Party by various identifiers
// =============================================

export async function getPartyById(partyId: string): Promise<Party | null> {
  return resolveFinalParty(partyId);
}

export async function getPartyByCustomer(customerId: string): Promise<Party | null> {
  const link = await findPartyLink("customer", customerId);
  if (!link) return null;
  return resolveFinalParty(link.partyId);
}

export async function getPartyByCounterparty(counterpartyId: string): Promise<Party | null> {
  const link = await findPartyLink("counterparty", counterpartyId);
  if (!link) return null;
  return resolveFinalParty(link.partyId);
}

export async function getPartyByTelegramId(telegramId: string): Promise<Party | null> {
  const customer = await db.customer.findUnique({
    where: { telegramId },
  });
  if (!customer) return null;
  return getPartyByCustomer(customer.id);
}

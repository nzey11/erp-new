// =============================================
// PARTY OWNER: Ownership Management Service
// =============================================

import { db } from "@/lib/shared/db";
import { resolveFinalPartyId } from "./party-resolver";
import type { PartyOwner, Party } from "@/lib/generated/prisma/client";
import type { AssignOwnerOptions } from "../types";

// =============================================
// Get Owner Functions
// =============================================

/**
 * Get the primary owner for a party
 * Uses denormalized primaryOwnerUserId for fast lookup
 */
export async function getOwner(partyId: string): Promise<string | null> {
  const finalPartyId = await resolveFinalPartyId(partyId);

  const party = await db.party.findUnique({
    where: { id: finalPartyId },
    select: { primaryOwnerUserId: true },
  });

  return party?.primaryOwnerUserId ?? null;
}

/**
 * Get all owners for a party (including backup)
 */
export async function getOwners(partyId: string): Promise<PartyOwner[]> {
  const finalPartyId = await resolveFinalPartyId(partyId);

  return db.partyOwner.findMany({
    where: {
      partyId: finalPartyId,
      isActive: true,
    },
    orderBy: { assignedAt: "desc" },
  });
}

/**
 * Get ownership history for a party
 */
export async function getOwnershipHistory(partyId: string): Promise<PartyOwner[]> {
  const finalPartyId = await resolveFinalPartyId(partyId);

  return db.partyOwner.findMany({
    where: { partyId: finalPartyId },
    orderBy: { assignedAt: "desc" },
  });
}

// =============================================
// Assign Owner Function
// =============================================

/**
 * Assign an owner to a party.
 * 
 * - Ends current owner of the same role
 * - Creates new owner record
 * - Updates denormalized primaryOwnerUserId if primary role
 */
export async function assignOwner(
  partyId: string,
  userId: string,
  options?: AssignOwnerOptions
): Promise<PartyOwner> {
  const finalPartyId = await resolveFinalPartyId(partyId);
  const role = options?.role ?? "primary";

  const result = await db.$transaction(async (tx) => {
    // End current owner of the same role
    await tx.partyOwner.updateMany({
      where: {
        partyId: finalPartyId,
        role,
        isActive: true,
      },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    // Create new owner record
    const newOwner = await tx.partyOwner.create({
      data: {
        partyId: finalPartyId,
        userId,
        role,
        assignedBy: options?.assignedBy,
      },
    });

    // Update denormalized primaryOwnerUserId if primary role
    if (role === "primary") {
      await tx.party.update({
        where: { id: finalPartyId },
        data: { primaryOwnerUserId: userId },
      });
    }

    return newOwner;
  });

  return result;
}

/**
 * Remove an owner from a party
 */
export async function removeOwner(
  partyId: string,
  userId: string
): Promise<void> {
  const finalPartyId = await resolveFinalPartyId(partyId);

  await db.$transaction(async (tx) => {
    // End the owner record
    await tx.partyOwner.updateMany({
      where: {
        partyId: finalPartyId,
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    // Clear denormalized primaryOwnerUserId if this was the primary owner
    const party = await tx.party.findUnique({
      where: { id: finalPartyId },
      select: { primaryOwnerUserId: true },
    });

    if (party?.primaryOwnerUserId === userId) {
      await tx.party.update({
        where: { id: finalPartyId },
        data: { primaryOwnerUserId: null },
      });
    }
  });
}

// =============================================
// Query Functions
// =============================================

/**
 * Get all parties owned by a user
 */
export async function getPartiesByOwner(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<Party[]> {
  return db.party.findMany({
    where: {
      primaryOwnerUserId: userId,
      status: "active",
    },
    orderBy: { lastActivityAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
  });
}

/**
 * Get count of parties owned by a user
 */
export async function getPartyCountByOwner(userId: string): Promise<number> {
  return db.party.count({
    where: {
      primaryOwnerUserId: userId,
      status: "active",
    },
  });
}

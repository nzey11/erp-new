// =============================================
// PARTY MERGE: Deduplication Service
// =============================================

import { db } from "@/lib/shared/db";
import { resolveFinalPartyId } from "./party-resolver";
import type { MergeRequest, Party } from "@/lib/generated/prisma/client";
import type { CreateMergeRequestInput } from "../types";

// =============================================
// Create Merge Request
// =============================================

/**
 * Create a merge request for review
 */
export async function createMergeRequest(
  input: CreateMergeRequestInput
): Promise<MergeRequest> {
  // Ensure survivor and victim are different
  if (input.survivorId === input.victimId) {
    throw new Error("Survivor and victim cannot be the same party");
  }

  // Check if merge request already exists
  const existing = await db.mergeRequest.findUnique({
    where: {
      survivorId_victimId: {
        survivorId: input.survivorId,
        victimId: input.victimId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  // Create merge request
  return db.mergeRequest.create({
    data: {
      survivorId: input.survivorId,
      victimId: input.victimId,
      detectionSource: input.detectionSource,
      confidence: input.confidence,
      matchReason: input.matchReason,
      createdBy: input.createdBy,
    },
  });
}

// =============================================
// Execute Merge
// =============================================

/**
 * Execute a merge, combining two parties into one.
 * 
 * The victim party is marked as "merged" and all references
 * are redirected to the survivor.
 * 
 * Important: This does NOT move or delete activities.
 * Activities remain linked to their original party, but
 * resolveFinalPartyId() will return the survivor's ID.
 * 
 * @param survivorId - The party to keep
 * @param victimId - The party to merge into survivor
 * @param mergeRequestId - Optional merge request ID for audit
 */
export async function executeMerge(
  survivorId: string,
  victimId: string,
  mergeRequestId?: string
): Promise<void> {
  // Resolve to final parties (in case of nested merges)
  const finalSurvivorId = await resolveFinalPartyId(survivorId);
  const finalVictimId = await resolveFinalPartyId(victimId);

  if (finalSurvivorId === finalVictimId) {
    throw new Error("Survivor and victim resolve to the same party");
  }

  await db.$transaction(async (tx) => {
    // 1. Mark victim as merged
    await tx.party.update({
      where: { id: finalVictimId },
      data: {
        status: "merged",
        mergedIntoId: finalSurvivorId,
        mergedAt: new Date(),
      },
    });

    // 2. Reassign PartyLinks from victim to survivor
    await tx.partyLink.updateMany({
      where: { partyId: finalVictimId },
      data: { partyId: finalSurvivorId },
    });

    // 3. Reassign PartyOwners from victim to survivor (if no conflict)
    const victimOwners = await tx.partyOwner.findMany({
      where: { partyId: finalVictimId, isActive: true },
    });

    for (const owner of victimOwners) {
      // Check if survivor already has an owner with this role
      const existingOwner = await tx.partyOwner.findFirst({
        where: {
          partyId: finalSurvivorId,
          role: owner.role,
          isActive: true,
        },
      });

      if (!existingOwner) {
        // Move owner to survivor
        await tx.partyOwner.update({
          where: { id: owner.id },
          data: { partyId: finalSurvivorId },
        });
      } else {
        // End the victim's owner record
        await tx.partyOwner.update({
          where: { id: owner.id },
          data: { isActive: false, endedAt: new Date() },
        });
      }
    }

    // 4. Update denormalized cache fields on survivor
    const victimParty = await tx.party.findUnique({
      where: { id: finalVictimId },
      select: {
        primaryCustomerId: true,
        primaryCounterpartyId: true,
        primaryOwnerUserId: true,
        lastActivityAt: true,
      },
    });

    const survivorParty = await tx.party.findUnique({
      where: { id: finalSurvivorId },
      select: {
        primaryCustomerId: true,
        primaryCounterpartyId: true,
        primaryOwnerUserId: true,
        lastActivityAt: true,
      },
    });

    if (victimParty && survivorParty) {
      // Clear victim's denormalized fields to avoid unique constraint violations
      await tx.party.update({
        where: { id: finalVictimId },
        data: {
          primaryCustomerId: null,
          primaryCounterpartyId: null,
          primaryOwnerUserId: null,
        },
      });

      await tx.party.update({
        where: { id: finalSurvivorId },
        data: {
          // Inherit customer/counterparty if survivor doesn't have one
          primaryCustomerId: survivorParty.primaryCustomerId ?? victimParty.primaryCustomerId,
          primaryCounterpartyId: 
            survivorParty.primaryCounterpartyId ?? victimParty.primaryCounterpartyId,
          // Inherit owner if survivor doesn't have one
          primaryOwnerUserId: survivorParty.primaryOwnerUserId ?? victimParty.primaryOwnerUserId,
          // Use most recent activity
          lastActivityAt: 
            victimParty.lastActivityAt && survivorParty.lastActivityAt
              ? new Date(Math.max(
                  victimParty.lastActivityAt.getTime(),
                  survivorParty.lastActivityAt.getTime()
                ))
              : (victimParty.lastActivityAt ?? survivorParty.lastActivityAt),
        },
      });
    }

    // 5. Update merge request status if provided
    if (mergeRequestId) {
      await tx.mergeRequest.update({
        where: { id: mergeRequestId },
        data: {
          status: "executed",
          executedAt: new Date(),
        },
      });
    }
  });
}

// =============================================
// Approve/Reject Merge Request
// =============================================

/**
 * Approve a merge request
 */
export async function approveMergeRequest(
  mergeRequestId: string,
  reviewedBy: string
): Promise<void> {
  const mergeRequest = await db.mergeRequest.findUnique({
    where: { id: mergeRequestId },
  });

  if (!mergeRequest) {
    throw new Error("Merge request not found");
  }

  if (mergeRequest.status !== "pending") {
    throw new Error(`Merge request is already ${mergeRequest.status}`);
  }

  await db.mergeRequest.update({
    where: { id: mergeRequestId },
    data: {
      status: "approved",
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  // Execute the merge
  await executeMerge(mergeRequest.survivorId, mergeRequest.victimId, mergeRequestId);
}

/**
 * Reject a merge request
 */
export async function rejectMergeRequest(
  mergeRequestId: string,
  reviewedBy: string
): Promise<void> {
  await db.mergeRequest.update({
    where: { id: mergeRequestId },
    data: {
      status: "rejected",
      reviewedBy,
      reviewedAt: new Date(),
    },
  });
}

// =============================================
// Query Functions
// =============================================

/**
 * Get pending merge requests
 */
export async function getPendingMergeRequests(): Promise<MergeRequest[]> {
  return db.mergeRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: {
      survivor: { select: { id: true, displayName: true } },
      victim: { select: { id: true, displayName: true } },
    },
  });
}

/**
 * Get merge history for a party
 */
export async function getMergeHistory(partyId: string): Promise<{
  mergedFrom: Party[];
  mergedInto: Party | null;
}> {
  const party = await db.party.findUnique({
    where: { id: partyId },
    include: {
      mergedFrom: true,
      mergedInto: true,
    },
  });

  return {
    mergedFrom: party?.mergedFrom ?? [],
    mergedInto: party?.mergedInto ?? null,
  };
}

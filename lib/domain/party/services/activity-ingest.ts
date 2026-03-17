// =============================================
// ACTIVITY INGEST: Timeline Recording Service
// =============================================

import { db } from "@/lib/shared/db";
import { resolveParty, resolveFinalPartyId } from "./party-resolver";
import type { PartyActivity } from "@/lib/generated/prisma/client";
import type { ActivityInput } from "../types";

// =============================================
// Main Activity Recording Function
// =============================================

/**
 * Records an activity on a Party's timeline.
 * 
 * - Resolves party from hints (creates if necessary)
 * - Creates PartyActivity record
 * - Updates lastActivityAt on Party
 * 
 * @param input - Activity details
 * @returns The created PartyActivity
 */
export async function recordActivity(input: ActivityInput): Promise<PartyActivity> {
  const { type, hints, sourceType, sourceId, summary, occurredAt } = input;

  // Resolve party (create if necessary)
  const { partyId } = await resolveParty(hints);

  // Resolve to final party (in case of merge)
  const finalPartyId = await resolveFinalPartyId(partyId);

  // Determine occurredAt timestamp
  const activityOccurredAt = occurredAt ?? new Date();

  // Create activity and update lastActivityAt in transaction
  const activity = await db.$transaction(async (tx) => {
    // Create activity
    const newActivity = await tx.partyActivity.create({
      data: {
        partyId: finalPartyId,
        type,
        occurredAt: activityOccurredAt,
        sourceType,
        sourceId,
        summary: JSON.parse(JSON.stringify(summary)),
      },
    });

    // Update lastActivityAt (only if new timestamp is more recent)
    // Using raw query for GREATEST pattern
    await tx.$executeRaw`
      UPDATE "Party"
      SET "lastActivityAt" = GREATEST("lastActivityAt", ${activityOccurredAt})
      WHERE id = ${finalPartyId}
    `;

    return newActivity;
  });

  return activity;
}

// =============================================
// Convenience Functions for Common Activities
// =============================================

/**
 * Record an order_placed activity
 */
export async function recordOrderPlaced(params: {
  customerId?: string;
  counterpartyId?: string;
  documentId: string;
  orderNumber: string;
  totalAmount: number;
  occurredAt?: Date;
}): Promise<PartyActivity> {
  return recordActivity({
    type: "order_placed",
    hints: {
      customerId: params.customerId,
      counterpartyId: params.counterpartyId,
    },
    sourceType: "document",
    sourceId: params.documentId,
    summary: {
      orderNumber: params.orderNumber,
      totalAmount: params.totalAmount,
    },
    occurredAt: params.occurredAt,
  });
}

/**
 * Record a payment_received activity
 */
export async function recordPaymentReceived(params: {
  counterpartyId?: string;
  paymentId: string;
  amount: number;
  method: string;
  occurredAt?: Date;
}): Promise<PartyActivity> {
  return recordActivity({
    type: "payment_received",
    hints: {
      counterpartyId: params.counterpartyId,
    },
    sourceType: "payment",
    sourceId: params.paymentId,
    summary: {
      amount: params.amount,
      method: params.method,
    },
    occurredAt: params.occurredAt,
  });
}

/**
 * Record a manager_interaction activity
 */
export async function recordManagerInteraction(params: {
  counterpartyId?: string;
  interactionId: string;
  interactionType: string;
  subject?: string;
  occurredAt?: Date;
}): Promise<PartyActivity> {
  return recordActivity({
    type: "manager_interaction",
    hints: {
      counterpartyId: params.counterpartyId,
    },
    sourceType: "interaction",
    sourceId: params.interactionId,
    summary: {
      type: params.interactionType,
      subject: params.subject,
    },
    occurredAt: params.occurredAt,
  });
}

// =============================================
// Query Functions
// =============================================

/**
 * Get activities for a party, ordered by occurrence date
 */
export async function getPartyActivities(
  partyId: string,
  options?: {
    limit?: number;
    offset?: number;
    types?: string[];
  }
): Promise<PartyActivity[]> {
  const finalPartyId = await resolveFinalPartyId(partyId);

  return db.partyActivity.findMany({
    where: {
      partyId: finalPartyId,
      ...(options?.types && { type: { in: options.types } }),
    },
    orderBy: { occurredAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset,
  });
}

/**
 * Get recent activities across all parties (for dashboard)
 */
export async function getRecentActivities(limit = 50): Promise<PartyActivity[]> {
  return db.partyActivity.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      party: {
        select: {
          id: true,
          displayName: true,
          type: true,
        },
      },
    },
  });
}

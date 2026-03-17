// =============================================
// PARTY: Type Definitions
// =============================================

import type { Party, PartyLink, PartyActivity, PartyOwner, MergeRequest } from "@/lib/generated/prisma/client";

// =============================================
// Hints for Party Resolution
// =============================================

export interface PartyHints {
  /** Direct Party ID if already known */
  partyId?: string;
  /** Customer ID from e-commerce */
  customerId?: string;
  /** Counterparty ID from accounting */
  counterpartyId?: string;
  /** Telegram user ID */
  telegramId?: string;
}

// =============================================
// Resolved Party Result
// =============================================

export interface ResolvedParty {
  partyId: string;
  isNew: boolean;
  party: Party;
}

// =============================================
// Activity Input
// =============================================

export interface ActivityInput {
  /** Activity type: order_placed, payment_received, manager_interaction */
  type: string;
  /** Hints for party resolution */
  hints: PartyHints;
  /** Source type: document, payment, interaction, manual */
  sourceType: string;
  /** Source ID (nullable for manual activities) */
  sourceId?: string;
  /** Lightweight summary for timeline display */
  summary: Record<string, unknown>;
  /** When the activity occurred (defaults to now if not provided) */
  occurredAt?: Date;
}

// =============================================
// Ownership Types
// =============================================

export type OwnerRole = "primary" | "backup";

export interface AssignOwnerOptions {
  /** Owner role (default: primary) */
  role?: OwnerRole;
  /** User who assigned the owner */
  assignedBy?: string;
}

// =============================================
// Merge Types
// =============================================

export type MergeStatus = "pending" | "approved" | "executed" | "rejected";

export interface CreateMergeRequestInput {
  survivorId: string;
  victimId: string;
  detectionSource: string;
  confidence?: number;
  matchReason?: string;
  createdBy?: string;
}

// =============================================
// Activity Types (Phase 1)
// =============================================

export const ACTIVITY_TYPES = {
  order_placed: {
    sourceType: "document",
    description: "Order placed",
  },
  payment_received: {
    sourceType: "payment",
    description: "Payment received",
  },
  manager_interaction: {
    sourceType: "interaction",
    description: "Manager interaction",
  },
} as const;

export type ActivityType = keyof typeof ACTIVITY_TYPES;

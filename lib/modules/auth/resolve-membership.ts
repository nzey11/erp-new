/**
 * Tenant Membership Resolution
 *
 * Resolves the active tenant membership for a user during authentication.
 * In v1, users have exactly one membership (enforced in code, not schema).
 * In v2, this will support tenant picker UI for multi-tenant access.
 *
 * @module lib/modules/auth/resolve-membership
 */

import { db } from "@/lib/shared/db";
import type { ErpRole } from "@/lib/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedMembership {
  membershipId: string;
  tenantId: string;
  role: ErpRole;
  tenantName: string;
  tenantSlug: string;
}

export type MembershipErrorCode =
  | "NO_MEMBERSHIP"
  | "MEMBERSHIP_INACTIVE"
  | "TENANT_INACTIVE"
  | "MULTIPLE_MEMBERSHIPS";

// ─── Error Class ──────────────────────────────────────────────────────────────

export class MembershipResolutionError extends Error {
  constructor(
    message: string,
    public code: MembershipErrorCode
  ) {
    super(message);
    this.name = "MembershipResolutionError";
  }
}

// ─── Error Messages ───────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<MembershipErrorCode, string> = {
  NO_MEMBERSHIP:
    "У вас нет доступа к организациям. Обратитесь к администратору.",
  MEMBERSHIP_INACTIVE:
    "Ваш доступ к организации приостановлен. Обратитесь к администратору.",
  TENANT_INACTIVE:
    "Организация деактивирована. Обратитесь к администратору.",
  MULTIPLE_MEMBERSHIPS:
    "Обнаружено несколько организаций. Пожалуйста, выберите организацию.",
};

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Resolve the active tenant membership for a user.
 *
 * v1 Behavior:
 * - User must have exactly ONE active membership
 * - Membership must be active
 * - Tenant must be active
 *
 * v2 Behavior (future):
 * - Support multiple memberships
 * - Return list for tenant picker UI
 *
 * @param userId - The user ID to resolve membership for
 * @returns Resolved membership with tenant context
 * @throws MembershipResolutionError if no valid membership found
 */
export async function resolveActiveMembershipForUser(
  userId: string
): Promise<ResolvedMembership> {
  // Find all memberships for this user (including inactive, to give specific errors)
  const memberships = await db.tenantMembership.findMany({
    where: {
      userId,
    },
    include: {
      tenant: true,
    },
  });

  // Case 1: No memberships at all
  if (memberships.length === 0) {
    throw new MembershipResolutionError(
      ERROR_MESSAGES.NO_MEMBERSHIP,
      "NO_MEMBERSHIP"
    );
  }

  // Filter to active memberships with active tenants
  const activeMemberships = memberships.filter(
    (m) => m.isActive && m.tenant.isActive
  );

  // Case 2: Has memberships but none are active
  if (activeMemberships.length === 0) {
    // Check if it's membership inactive or tenant inactive
    const hasInactiveMembership = memberships.some((m) => !m.isActive);
    if (hasInactiveMembership) {
      throw new MembershipResolutionError(
        ERROR_MESSAGES.MEMBERSHIP_INACTIVE,
        "MEMBERSHIP_INACTIVE"
      );
    }

    // Otherwise, tenant is inactive
    throw new MembershipResolutionError(
      ERROR_MESSAGES.TENANT_INACTIVE,
      "TENANT_INACTIVE"
    );
  }

  // Case 3: Multiple active memberships (v2 will handle this with picker)
  // In v1, this is unexpected but we should handle it gracefully
  if (activeMemberships.length > 1) {
    // For v1: This shouldn't happen due to constraint, but if it does,
    // we return the first one (deterministic by createdAt)
    // In v2, this will throw with MULTIPLE_MEMBERSHIPS code for picker UI
    // For now, log a warning and auto-select first
    console.warn(
      `[resolveActiveMembershipForUser] User ${userId} has ${activeMemberships.length} active memberships. Auto-selecting first.`
    );
  }

  // Select first active membership (sorted by createdAt for determinism)
  const selected = activeMemberships.sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime()
  )[0];

  return {
    membershipId: selected.id,
    tenantId: selected.tenantId,
    role: selected.role,
    tenantName: selected.tenant.name,
    tenantSlug: selected.tenant.slug,
  };
}

// ─── Helper for v2: Get All Memberships ───────────────────────────────────────

/**
 * Get all active memberships for a user (for tenant picker UI in v2).
 *
 * @param userId - The user ID
 * @returns Array of active memberships with tenant info
 */
export async function getActiveMembershipsForUser(
  userId: string
): Promise<Array<ResolvedMembership>> {
  const memberships = await db.tenantMembership.findMany({
    where: {
      userId,
      isActive: true,
      tenant: {
        isActive: true,
      },
    },
    include: {
      tenant: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    tenantId: m.tenantId,
    role: m.role,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
  }));
}

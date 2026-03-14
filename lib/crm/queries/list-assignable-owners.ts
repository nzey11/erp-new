/**
 * List Assignable CRM Owners
 *
 * Returns users who can be assigned as party owners.
 * Policy: admin and manager roles only.
 */

import { db } from "@/lib/shared/db";

export interface AssignableOwner {
  id: string;
  username: string;
}

export interface ListAssignableOwnersOptions {
  /** Exclude a specific user from results (e.g., current owner) */
  excludeUserId?: string;
}

/**
 * Returns list of users eligible for party ownership.
 *
 * Selection policy:
 * - User must have admin or manager role
 * - Optionally excludes a specific user ID
 *
 * @param options.excludeUserId - User ID to exclude from results
 * @returns Array of assignable owners sorted by username
 */
export async function listAssignableCrmOwners(
  options?: ListAssignableOwnersOptions
): Promise<AssignableOwner[]> {
  return db.user.findMany({
    where: {
      role: { in: ["admin", "manager"] },
      isActive: true,
      ...(options?.excludeUserId && { id: { not: options.excludeUserId } }),
    },
    select: {
      id: true,
      username: true,
    },
    orderBy: {
      username: "asc",
    },
  });
}

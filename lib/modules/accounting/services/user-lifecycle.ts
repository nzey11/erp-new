// =============================================
// USER LIFECYCLE: Invariants & Protection
// =============================================

import { db } from "@/lib/shared/db";

/**
 * Protected usernames that cannot be deactivated or deleted.
 * These are system/bootstrap accounts essential for recovery.
 */
export const PROTECTED_USERNAMES = ["admin", "test", "developer"];

/**
 * Check if a username is protected from lifecycle changes.
 */
export function isProtectedUser(username: string): boolean {
  return PROTECTED_USERNAMES.includes(username.toLowerCase());
}

/**
 * Error thrown when attempting to modify a protected user.
 */
export class ProtectedUserError extends Error {
  constructor(
    public action: "deactivate" | "delete" | "modify",
    public username: string
  ) {
    super(`Cannot ${action} protected system user "${username}"`);
    this.name = "ProtectedUserError";
  }

  toResponse(): { error: string; status: number } {
    return {
      error: this.message,
      status: 403,
    };
  }
}

/**
 * Assert that a user can be deactivated.
 * Throws ProtectedUserError if the user is protected.
 */
export async function assertUserCanBeDeactivated(
  userId: string
): Promise<{ username: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (isProtectedUser(user.username)) {
    throw new ProtectedUserError("deactivate", user.username);
  }

  return user;
}

/**
 * Assert that a user can be deleted (soft delete).
 * Throws ProtectedUserError if the user is protected.
 */
export async function assertUserCanBeDeleted(
  userId: string
): Promise<{ username: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (isProtectedUser(user.username)) {
    throw new ProtectedUserError("delete", user.username);
  }

  return user;
}

/**
 * Check if isActive change is allowed for a user.
 * Returns true if allowed, false if user is protected and trying to deactivate.
 */
export async function canChangeUserActiveStatus(
  userId: string,
  newIsActive: boolean
): Promise<{ allowed: boolean; username?: string; reason?: string }> {
  // Activation is always allowed
  if (newIsActive === true) {
    return { allowed: true };
  }

  // Deactivation needs protection check
  try {
    const user = await assertUserCanBeDeactivated(userId);
    return { allowed: true, username: user.username };
  } catch (error) {
    if (error instanceof ProtectedUserError) {
      return { allowed: false, reason: error.message };
    }
    throw error;
  }
}

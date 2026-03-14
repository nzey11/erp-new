/**
 * Owner Assignment Server Actions
 *
 * Server actions for assigning party owners.
 */

"use server";

import { revalidatePath } from "next/cache";
import { assignOwner } from "@/lib/party";
import { requirePermission, AuthorizationError } from "@/lib/shared/authorization";

export type AssignPartyOwnerResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Assign a new owner to a party.
 *
 * @param partyId - The party ID
 * @param userId - The user ID to assign as owner
 * @returns Result indicating success or failure with message
 */
export async function assignPartyOwner(
  partyId: string,
  userId: string
): Promise<AssignPartyOwnerResult> {
  try {
    // Permission check
    await requirePermission("crm:assignOwner");

    // Domain service call
    await assignOwner(partyId, userId, { role: "primary" });

    // Revalidation
    revalidatePath(`/crm/parties/${partyId}`);
    revalidatePath("/crm/parties");

    return { ok: true };
  } catch (error) {
    // Permission errors
    if (error instanceof AuthorizationError) {
      return { ok: false, message: "Недостаточно прав для назначения владельца" };
    }

    // Domain errors
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }

    // Fallback
    return { ok: false, message: "Произошла ошибка. Попробуйте ещё раз" };
  }
}

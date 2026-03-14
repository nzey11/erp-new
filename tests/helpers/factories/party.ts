/**
 * Party domain test factories.
 *
 * Factories for Party (cross-domain identity) entities.
 */

import { db } from "@/lib/shared/db";
import { uniqueId } from "./core";

// =============================================
// Party Factory
// =============================================

export async function createParty(
  overrides: Partial<{
    displayName: string;
    type: "person" | "organization";
    status: "active" | "merged" | "blocked";
    primaryOwnerUserId: string | null;
  }> = {}
) {
  const id = uniqueId();
  return db.party.create({
    data: {
      displayName: overrides.displayName ?? `Партия ${id}`,
      type: overrides.type ?? "person",
      status: overrides.status ?? "active",
      primaryOwnerUserId: overrides.primaryOwnerUserId ?? null,
    },
  });
}

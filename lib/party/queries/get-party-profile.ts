/**
 * Get Party Profile Query
 *
 * Data access for Party Profile page.
 * Fetches party with all related data.
 */

import { db } from "@/lib/shared/db";
import { resolveFinalPartyId } from "../services/party-resolver";
import type { PartyProfileDto } from "../dto/party-profile.dto";
import { mapPartyToProfile } from "../mappers/party-profile.mapper";

export async function getPartyProfile(partyId: string): Promise<PartyProfileDto | null> {
  // Resolve to final party (in case of merge)
  const finalPartyId = await resolveFinalPartyId(partyId);

  const party = await db.party.findUnique({
    where: { id: finalPartyId },
    include: {
      primaryOwner: {
        select: { id: true, username: true },
      },
      links: {
        include: {
          // We need to get the linked entity names
          // But Prisma doesn't support polymorphic includes directly
          // So we'll fetch customer/counterparty separately
        },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 50,
      },
    },
  });

  if (!party) {
    return null;
  }

  // Fetch linked entity names
  const linksWithNames = await Promise.all(
    party.links.map(async (link) => {
      let customer = null;
      let counterparty = null;

      if (link.entityType === "customer") {
        customer = await db.customer.findUnique({
          where: { id: link.entityId },
          select: { id: true, name: true },
        });
      } else if (link.entityType === "counterparty") {
        counterparty = await db.counterparty.findUnique({
          where: { id: link.entityId },
          select: { id: true, name: true },
        });
      }

      return {
        entityType: link.entityType,
        entityId: link.entityId,
        customer,
        counterparty,
      };
    })
  );

  return mapPartyToProfile({
    ...party,
    links: linksWithNames,
    activities: party.activities,
  });
}

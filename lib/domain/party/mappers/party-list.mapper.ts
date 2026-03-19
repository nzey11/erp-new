/**
 * Party List Mapper
 *
 * Transforms Prisma results to UI-friendly DTOs.
 */

import type { PartyLink, User } from "@/lib/generated/prisma/client";
import type { PartyListItemDto } from "../dto/party-list.dto";

interface PartyWithRelations {
  id: string;
  displayName: string;
  type: "person" | "organization";
  primaryOwnerUserId: string | null;
  lastActivityAt: Date | null;
  status: string;
  links: Pick<PartyLink, "entityType">[];
  primaryOwner?: Pick<User, "id" | "username"> | null;
}

export function mapPartyToListItem(party: PartyWithRelations): PartyListItemDto {
  const links = party.links
    .map((l) => l.entityType as "customer" | "counterparty")
    .filter((v, i, a) => a.indexOf(v) === i); // unique

  return {
    id: party.id,
    displayName: party.displayName,
    type: party.type,
    ownerName: party.primaryOwner?.username ?? null,
    lastActivityAt: party.lastActivityAt?.toISOString() ?? null,
    links,
  };
}

export function mapPartiesToListResult(
  parties: PartyWithRelations[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    items: parties.map(mapPartyToListItem),
    total,
    page,
    pageSize,
  };
}

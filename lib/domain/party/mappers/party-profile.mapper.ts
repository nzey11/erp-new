/**
 * Party Profile Mapper
 *
 * Transforms Prisma results to UI-friendly DTOs.
 */

import type { PartyActivity, User, Customer, Counterparty } from "@/lib/generated/prisma/client";
import type { PartyProfileDto, PartyProfileLinkDto, PartyProfileActivityDto, PartyProfileOwnerDto } from "../dto/party-profile.dto";

interface PartyProfileData {
  id: string;
  displayName: string;
  type: "person" | "organization";
  notes: string | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  primaryOwner?: Pick<User, "id" | "username"> | null;
  links: Array<{
    entityType: string;
    entityId: string;
    customer?: Pick<Customer, "id" | "name"> | null;
    counterparty?: Pick<Counterparty, "id" | "name"> | null;
  }>;
  activities: Array<Pick<PartyActivity, "id" | "type" | "occurredAt" | "summary">>;
}

export function mapPartyToProfile(party: PartyProfileData): PartyProfileDto {
  const links: PartyProfileLinkDto[] = party.links.map((link) => ({
    type: link.entityType as "customer" | "counterparty",
    entityId: link.entityId,
    label: link.entityType === "customer"
      ? (link.customer?.name ?? "Unknown Customer")
      : (link.counterparty?.name ?? "Unknown Counterparty"),
  }));

  const activities: PartyProfileActivityDto[] = party.activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    occurredAt: activity.occurredAt.toISOString(),
    summary: activity.summary as Record<string, unknown>,
  }));

  const owner: PartyProfileOwnerDto | null = party.primaryOwner
    ? { id: party.primaryOwner.id, name: party.primaryOwner.username }
    : null;

  return {
    id: party.id,
    displayName: party.displayName,
    type: party.type,
    owner,
    notes: party.notes,
    links,
    activities,
    lastActivityAt: party.lastActivityAt?.toISOString() ?? null,
    createdAt: party.createdAt.toISOString(),
  };
}

/**
 * Party Profile DTO
 *
 * Contract between data layer and UI for Party Profile page.
 */

export interface PartyProfileLinkDto {
  type: "customer" | "counterparty";
  entityId: string;
  label: string;
}

export interface PartyProfileActivityDto {
  id: string;
  type: string;
  occurredAt: string;
  summary: Record<string, unknown>;
}

export interface PartyProfileOwnerDto {
  id: string;
  name: string;
}

export interface PartyProfileDto {
  id: string;
  displayName: string;
  type: "person" | "organization";
  owner: PartyProfileOwnerDto | null;
  notes: string | null;
  links: PartyProfileLinkDto[];
  activities: PartyProfileActivityDto[];
  lastActivityAt: string | null;
  createdAt: string;
}

/**
 * Party List DTO
 *
 * Contract between data layer and UI for Party List.
 * DB shape != UI shape - this DTO defines the UI-friendly shape.
 */

export interface PartyListItemDto {
  id: string;
  displayName: string;
  type: "person" | "organization";
  ownerName: string | null;
  lastActivityAt: string | null;
  links: Array<"customer" | "counterparty">;
}

export interface PartyListFilter {
  search?: string;
  ownerId?: string;
  type?: "person" | "organization";
  includeMerged?: boolean;
  includeBlocked?: boolean;
}

export interface PartyListResult {
  items: PartyListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

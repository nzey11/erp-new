/**
 * Party Table
 *
 * Presentational table component for party list.
 * DisplayName is clickable and navigates to profile page.
 *
 * Delegates to PartyListTable which has built-in feature flag switch.
 * - flag=true  → PresetPartyListTable (DataGrid + preset)
 * - flag=false → LegacyPartyListTable (raw HTML table)
 */

import { PartyListTable } from "@/components/domain/crm/parties";
import type { PartyListItemDto } from "@/lib/domain/party";

interface PartyTableProps {
  items: PartyListItemDto[];
}

/**
 * Party table wrapper.
 * Delegates to PartyListTable with built-in feature flag.
 */
export function PartyTable({ items }: PartyTableProps) {
  return <PartyListTable parties={items} />;
}

/**
 * Preset-driven Party List Table
 *
 * DataGrid-based implementation using party-preset.
 * This is the new preset-driven version of PartyListTable.
 */

"use client";

import { DataGrid } from "@/components/ui/data-grid";
import { adaptPreset } from "@/components/ui/data-grid/preset-adapter";
import { partyPreset } from "@/lib/table-system/presets";
import type { PartyListItemDto } from "@/lib/domain/party/dto";

interface PresetPartyListTableProps {
  parties: PartyListItemDto[];
}

/**
 * Party list table using preset system.
 *
 * Uses:
 * - partyPreset for column definitions
 * - preset-adapter for DataGrid transformation
 * - Shared cell renderers for formatting
 */
export function PresetPartyListTable({ parties }: PresetPartyListTableProps) {
  // Adapt preset to DataGrid props
  const adapted = adaptPreset(partyPreset);

  return (
    <DataGrid
      data={parties}
      columns={adapted.columns}
      persistenceKey={adapted.persistenceKey}
      emptyMessage="No parties found"
      stickyHeader={false}
      density="normal"
    />
  );
}

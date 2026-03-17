/**
 * Party List Table
 *
 * Displays parties in a data grid.
 *
 * Migration Status: Tier 1
 * - Feature flag: TABLE_SYSTEM_V1.tables.partyListTable
 * - Preset: partyPreset
 * - Maturity Level: adapter-based (Level 1)
 */

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PartyListItemDto } from "@/lib/domain/party/dto";
import { usePresetTable, showBothTables } from "@/lib/table-system/feature-flags";
import { PresetPartyListTable } from "./preset-party-list-table";

interface PartyListTableProps {
  parties: PartyListItemDto[];
}

/**
 * Format date as relative time for CRM list views.
 */
function formatRelativeDate(isoString: string | null): string {
  if (!isoString) return "—";

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} нед. назад`;
  } else {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

/**
 * Legacy party list table implementation.
 * Uses raw HTML table element.
 * Mirrors original party-table.tsx behavior.
 */
function LegacyPartyListTable({ parties }: PartyListTableProps) {
  if (parties.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Нет партий
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium">Наименование</th>
            <th className="text-left py-3 px-4 font-medium">Тип</th>
            <th className="text-left py-3 px-4 font-medium">Владелец</th>
            <th className="text-left py-3 px-4 font-medium">Последняя активность</th>
            <th className="text-left py-3 px-4 font-medium">Связи</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((party) => (
            <tr
              key={party.id}
              className="border-b hover:bg-muted/50 transition-colors"
            >
              <td className="py-3 px-4">
                <Link
                  href={`/crm/parties/${party.id}`}
                  className="font-medium hover:underline"
                >
                  {party.displayName}
                </Link>
              </td>
              <td className="py-3 px-4">
                {party.type === "person" ? "Физ. лицо" : "Организация"}
              </td>
              <td className="py-3 px-4 text-muted-foreground">
                {party.ownerName || "—"}
              </td>
              <td className="py-3 px-4 text-muted-foreground">
                {formatRelativeDate(party.lastActivityAt)}
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-1 flex-wrap">
                  {party.links.map((link, index) => (
                    <Badge key={index} variant="secondary">
                      {link === "customer" ? "Покупатель" : "Контрагент"}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Party List Table with feature flag switch.
 *
 * When TABLE_SYSTEM_V1.tables.partyListTable is true:
 * - Uses PresetPartyListTable (DataGrid + preset)
 *
 * When false:
 * - Uses LegacyPartyListTable (raw HTML table)
 *
 * Debug mode (showBothTables):
 * - Renders both versions side-by-side for comparison
 */
export function PartyListTable(props: PartyListTableProps) {
  const usePreset = usePresetTable("partyListTable");
  const showBoth = showBothTables();

  // Debug mode: show both versions
  if (showBoth) {
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Preset Version (New)
          </h3>
          <PresetPartyListTable {...props} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Legacy Version (Old)
          </h3>
          <LegacyPartyListTable {...props} />
        </div>
      </div>
    );
  }

  // Feature flag switch
  return usePreset ? (
    <PresetPartyListTable {...props} />
  ) : (
    <LegacyPartyListTable {...props} />
  );
}

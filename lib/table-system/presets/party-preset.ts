/**
 * Party List Table Preset
 *
 * Preset for CRM Party list table.
 * First PoC for table system v1.
 */

import { createListTablePreset } from "@/lib/table-system/types";
import type { PartyListItemDto } from "@/lib/domain/party/dto";

/**
 * Format date as relative time for CRM list views.
 * Mirrors party-table.tsx behavior for parity.
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
 * Party list table preset.
 *
 * Columns:
 * - displayName: Name with navigation link
 * - type: Person/Organization badge (Russian labels)
 * - ownerName: Owner name
 * - lastActivityAt: Relative date (Сегодня, Вчера, X дн. назад)
 * - links: Customer/Counterparty badges (Russian labels)
 */
export const partyPreset = createListTablePreset<PartyListItemDto>({
  id: "party-list",
  name: "Party List",
  description: "CRM parties list table",
  persistenceKey: "party-list-table",
  tier: "tier1",

  columns: [
    {
      id: "displayName",
      accessorKey: "displayName",
      header: "Наименование",
      width: 250,
      sortable: false,
      required: true,
      cellRenderer: "partyLink",
    },
    {
      id: "type",
      accessorKey: "type",
      header: "Тип",
      width: 120,
      sortable: false,
      cellRenderer: "badge",
      cellRendererProps: {
        variantMap: {
          person: "outline",
          organization: "outline",
        },
        labelMap: {
          person: "Физ. лицо",
          organization: "Организация",
        },
      },
    },
    {
      id: "ownerName",
      accessorKey: "ownerName",
      header: "Владелец",
      width: 150,
      sortable: false,
      format: (value) => (value as string | null) ?? "—",
    },
    {
      id: "lastActivityAt",
      accessorKey: "lastActivityAt",
      header: "Последняя активность",
      width: 150,
      sortable: false,
      format: (value) => formatRelativeDate(value as string | null),
    },
    {
      id: "links",
      accessorKey: "links",
      header: "Связи",
      width: 200,
      sortable: false,
      cellRenderer: "linkBadges",
      cellRendererProps: {
        labelMap: {
          customer: "Покупатель",
          counterparty: "Контрагент",
        },
      },
    },
  ],

  behavior: {
    sort: {
      defaultField: "displayName",
      defaultOrder: "asc",
    },
    pagination: {
      enabled: false, // Party list doesn't paginate currently
    },
    selection: {
      enabled: false,
    },
    urlSync: {
      enabled: false, // Party list doesn't sync to URL currently
    },
  },

  toolbar: {
    search: {
      enabled: false, // Party list doesn't have search currently
    },
    columnSettings: false, // Keep simple for PoC
  },
});

/**
 * Type export for use in components.
 */
export type PartyPreset = typeof partyPreset;

/**
 * Party List Table
 *
 * ERPTable-based implementation for CRM Party list.
 * Migrated from DataGrid to ERPTable.
 */

"use client";

import Link from "next/link";
import { Tag } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import type { PartyListItemDto } from "@/lib/domain/party/dto";

interface PresetPartyListTableProps {
  parties: PartyListItemDto[];
}

/**
 * Format date as relative time for CRM list views.
 * Mirrors party-preset behavior.
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

/** Type label mapping */
const typeLabelMap: Record<string, string> = {
  person: "Физ. лицо",
  organization: "Организация",
};

/** Link label mapping */
const linkLabelMap: Record<string, string> = {
  customer: "Покупатель",
  counterparty: "Контрагент",
};

/**
 * Party list table using ERPTable.
 *
 * Columns:
 * - displayName: Name with navigation link
 * - type: Person/Organization badge (Russian labels)
 * - ownerName: Owner name
 * - lastActivityAt: Relative date (Сегодня, Вчера, X дн. назад)
 * - links: Customer/Counterparty badges (Russian labels)
 */
export function PresetPartyListTable({ parties }: PresetPartyListTableProps) {
  const columns: ERPColumn<PartyListItemDto>[] = [
    {
      key: "displayName",
      dataIndex: "displayName",
      title: "Наименование",
      width: 250,
      render: (value, row) => (
        <Link
          href={`/crm/parties/${row.id}`}
          className="text-primary hover:underline font-medium"
        >
          {value as string}
        </Link>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: "Тип",
      width: 120,
      render: (value) => {
        const type = value as "person" | "organization";
        return <Tag>{typeLabelMap[type] ?? type}</Tag>;
      },
    },
    {
      key: "ownerName",
      dataIndex: "ownerName",
      title: "Владелец",
      width: 150,
      render: (value) => (value as string | null) ?? "—",
    },
    {
      key: "lastActivityAt",
      dataIndex: "lastActivityAt",
      title: "Последняя активность",
      width: 150,
      render: (value) => formatRelativeDate(value as string | null),
    },
    {
      key: "links",
      dataIndex: "links",
      title: "Связи",
      width: 200,
      render: (value) => {
        const links = value as Array<"customer" | "counterparty">;
        if (!links || links.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1 flex-wrap">
            {links.map((link, index) => (
              <Tag key={index}>{linkLabelMap[link] ?? link}</Tag>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <ERPTable
      data={parties}
      columns={columns}
      emptyText="No parties found"
      rowKey="id"
    />
  );
}

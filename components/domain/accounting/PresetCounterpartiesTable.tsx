/**
 * Preset-driven Counterparties Table
 *
 * ERPTable-based implementation using counterparty-preset column definitions.
 * Level 2 migration: DataGrid removed, ERPTable + ERPToolbar pattern.
 */

"use client";

import { useState, useEffect } from "react";
import { Select, Button, Input, Tag } from "antd";
import { ExternalLink } from "lucide-react";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { useRouter } from "next/navigation";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import { formatRub } from "@/lib/shared/utils";
import type { CounterpartyTableRow } from "@/lib/table-system/presets/counterparty-preset";
import { COUNTERPARTY_TYPE_LABELS } from "@/lib/table-system/presets/counterparty-preset";

interface PresetCounterpartiesTableProps {
  onCounterpartySelect?: (counterparty: CounterpartyTableRow) => void;
}

/**
 * Counterparties table using ERPTable + ERPToolbar.
 *
 * Column definitions are derived from counterpartyPreset.
 * Renderers are inlined (Tag for badge columns, formatRub for money).
 */

/** ERPColumn definitions converted from counterpartyPreset */
const COUNTERPARTY_COLUMNS: ERPColumn<CounterpartyTableRow>[] = [
  {
    key: "name",
    title: "Название",
    dataIndex: "name",
    width: 220,
    sortable: true,
    ellipsis: true,
  },
  {
    key: "type",
    title: "Тип",
    dataIndex: "type",
    width: 160,
    sortable: true,
    render: (value) => {
      const label = COUNTERPARTY_TYPE_LABELS[value as string] ?? (value as string);
      return <Tag>{label}</Tag>;
    },
  },
  {
    key: "inn",
    title: "ИНН",
    dataIndex: "inn",
    width: 140,
    sortable: true,
    render: (value) => <span>{(value as string | null) ?? "—"}</span>,
  },
  {
    key: "phone",
    title: "Телефон",
    dataIndex: "phone",
    width: 150,
    render: (value) => <span>{(value as string | null) ?? "—"}</span>,
  },
  {
    key: "balance",
    title: "Баланс",
    dataIndex: "balance",
    width: 140,
    align: "right",
    sortable: true,
    render: (_value, row) => {
      const amount = row.balance?.balanceRub ?? 0;
      const color =
        amount > 0 ? "#52c41a" : amount < 0 ? "#ff4d4f" : undefined;
      return (
        <span className="font-mono text-sm" style={color ? { color } : undefined}>
          {formatRub(amount)}
        </span>
      );
    },
  },
  {
    key: "isActive",
    title: "Статус",
    dataIndex: "isActive",
    width: 110,
    render: (value) =>
      value ? (
        <Tag color="success" variant="filled">Активен</Tag>
      ) : (
        <Tag color="default" variant="filled">Неактивен</Tag>
      ),
  },
];

export function PresetCounterpartiesTable({ onCounterpartySelect }: PresetCounterpartiesTableProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  // Fix hydration mismatch: Ant Design Select generates different IDs on server vs client
  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const grid = useDataGrid<CounterpartyTableRow>({
    endpoint: "/api/accounting/counterparties",
    pageSize: 25,
    enablePagination: true,
    enableSearch: true,
    sortable: true,
    defaultSort: { field: "name", order: "asc" },
    enablePageSizeChange: true,
    pageSizeOptions: [10, 25, 50, 100],
    defaultFilters: { type: "" },
    filterToParam: (key, value) => {
      if (!value) return null;
      return value;
    },
  });

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    grid.setFilter("type", value === "all" ? "" : value);
  };

  // Actions column — navigate to counterparty detail page
  const columnsWithActions: ERPColumn<CounterpartyTableRow>[] = [
    ...COUNTERPARTY_COLUMNS,
    {
      key: "actions",
      title: "",
      width: 50,
      align: "center",
      render: (_, row) => (
        <Button
          type="text"
          shape="circle"
          title="Открыть карточку"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/counterparties/${row.id}`);
          }}
          icon={<ExternalLink className="h-4 w-4" />}
        />
      ),
    },
  ];

  const handleRowClick = (row: CounterpartyTableRow) => {
    if (onCounterpartySelect) {
      onCounterpartySelect(row);
    } else {
      router.push(`/counterparties/${row.id}`);
    }
  };

  return (
    <>
      <ERPToolbar
        onCreateClick={() => router.push("/counterparties/new")}
        createLabel="Добавить"
        extraActions={
          <>
            <Input
              placeholder="Поиск по названию, ИНН, телефону..."
              value={grid.search}
              onChange={(e) => grid.setSearch(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            {mounted ? (
              <Select
                value={typeFilter}
                onChange={handleTypeChange}
                style={{ width: 192 }}
                options={[
                  { value: "all", label: "Все контрагенты" },
                  { value: "customer", label: "Покупатели" },
                  { value: "supplier", label: "Поставщики" },
                  { value: "both", label: "Покупатель/Поставщик" },
                ]}
              />
            ) : (
              <div className="w-48 h-9 border rounded-md bg-muted/50" />
            )}
          </>
        }
      />
      <ERPTable<CounterpartyTableRow>
        data={grid.data}
        columns={columnsWithActions}
        loading={grid.loading}
        rowKey="id"
        pagination={
          grid.gridProps.pagination
            ? {
                current: grid.gridProps.pagination.page,
                pageSize: grid.gridProps.pagination.pageSize,
                total: grid.gridProps.pagination.total,
              }
            : undefined
        }
        onChange={({ page, pageSize, sortField, sortOrder }) => {
          if (page !== undefined) grid.setPage(page);
          if (pageSize !== undefined) grid.setPageSize(pageSize);
          if (sortField !== undefined) {
            grid.setSort(
              sortField,
              sortOrder === "descend" ? "desc" : "asc",
            );
          }
        }}
        onRowClick={handleRowClick}
        rowClassName={() => "cursor-pointer"}
        emptyText={grid.search ? "Ничего не найдено" : "Нет контрагентов"}
      />
    </>
  );
}

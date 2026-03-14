/**
 * Counterparties Table Preset
 *
 * Preset for accounting counterparties list table.
 * Level 1+ migration: columns + balance renderer + onRowClick parity.
 */

import type { ListTablePreset } from "@/lib/table-system/types";
import { createListTablePreset } from "@/lib/table-system/types";

/**
 * Counterparty data shape for table preset.
 * Matches the Counterparty interface from CounterpartiesTable.tsx
 */
export interface CounterpartyTableRow {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
  balance: { balanceRub: number } | null;
}

/**
 * Counterparty type labels (Russian).
 */
export const COUNTERPARTY_TYPE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель/Поставщик",
};

/**
 * Counterparty list table preset.
 *
 * Columns:
 * - name: Counterparty name (clickable via onRowClick)
 * - type: Customer/Supplier/Both badge
 * - inn: Tax ID
 * - phone: Phone number
 * - balance: Balance with color coding (green/red)
 * - isActive: Active/Inactive status
 *
 * Note: Actions column handled via columnOverrides (Level 1 compromise)
 */
export const counterpartyPreset = createListTablePreset<CounterpartyTableRow>({
  id: "counterparties",
  name: "Counterparties",
  description: "Accounting counterparties list table",
  persistenceKey: "counterparties",
  tier: "tier1",

  columns: [
    {
      id: "name",
      accessorKey: "name",
      header: "Название",
      width: 220,
      sortable: true,
      required: true,
      // No cellRenderer - plain text, navigation via onRowClick
    },
    {
      id: "type",
      accessorKey: "type",
      header: "Тип",
      width: 160,
      sortable: true,
      cellRenderer: "badge",
      cellRendererProps: {
        variantMap: {
          customer: "outline",
          supplier: "outline",
          both: "outline",
        },
        labelMap: COUNTERPARTY_TYPE_LABELS,
      },
    },
    {
      id: "inn",
      accessorKey: "inn",
      header: "ИНН",
      width: 140,
      sortable: true,
      format: (value) => (value as string | null) ?? "—",
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: "Телефон",
      width: 150,
      sortable: false,
      format: (value) => (value as string | null) ?? "—",
    },
    {
      id: "balance",
      accessorKey: "balance.balanceRub",
      header: "Баланс",
      width: 140,
      sortable: true,
      align: "right",
      cellRenderer: "money",
      cellRendererProps: {
        colorBySign: true,
      },
    },
    {
      id: "isActive",
      accessorKey: "isActive",
      header: "Статус",
      width: 110,
      sortable: false,
      cellRenderer: "badge",
      cellRendererProps: {
        variantMap: {
          true: "default",
          false: "secondary",
        },
        labelMap: {
          true: "Активен",
          false: "Неактивен",
        },
      },
    },
  ],

  behavior: {
    sort: {
      defaultField: "name",
      defaultOrder: "asc",
    },
    pagination: {
      enabled: true,
      defaultSize: 25,
      sizeOptions: [10, 25, 50, 100],
    },
    selection: {
      enabled: false,
    },
    urlSync: {
      enabled: false, // Handled by useDataGrid currently
    },
  },

  toolbar: {
    search: {
      enabled: true, // Will be handled by useDataGrid
    },
    columnSettings: false,
  },
});

/**
 * Type export for use in components.
 */
export type CounterpartyPreset = typeof counterpartyPreset;

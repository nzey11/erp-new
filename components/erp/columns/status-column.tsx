import type { ERPColumn } from "@/components/erp/erp-table.types";
import { StatusTag } from "@/components/erp/tags/status-tag";
import type { StatusMap } from "@/components/erp/tags/status-tag";

export type { StatusMap };

export interface StatusColumnOptions<T> {
  key: string;
  title: string;
  /** Functional accessor — extracts the status key from a row */
  accessor: (row: T) => string | boolean | null | undefined;
  /** Maps status keys to label + antd Tag color */
  statusMap: StatusMap;
  width?: number;
  sortable?: boolean;
}

/**
 * Creates a status column that renders an antd Tag via StatusTag.
 * Boolean values are coerced to strings ("true" / "false") before lookup.
 *
 * Usage:
 *   createStatusColumn<Counterparty>({
 *     key: "isActive",
 *     title: "Статус",
 *     accessor: (row) => row.isActive,
 *     statusMap: {
 *       true:  { label: "Активен",   color: "success" },
 *       false: { label: "Неактивен", color: "default" },
 *     },
 *   })
 */
export function createStatusColumn<T>(
  options: StatusColumnOptions<T>
): ERPColumn<T> {
  const { key, title, accessor, statusMap, width, sortable } = options;

  return {
    key,
    title,
    width,
    sortable,
    render: (_value, row) => {
      const raw = accessor(row);
      if (raw === null || raw === undefined) return "—";
      const statusKey = String(raw);
      return <StatusTag status={statusKey} statusMap={statusMap} />;
    },
  };
}

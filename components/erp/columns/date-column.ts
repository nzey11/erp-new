import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatDate, formatDateTime } from "@/lib/shared/utils";

export interface DateColumnOptions<T> {
  key: string;
  title: string;
  /** Functional accessor — extracts the date value from a row */
  accessor: (row: T) => Date | string | null | undefined;
  /** When true, includes HH:mm time in the formatted output */
  showTime?: boolean;
  width?: number;
  sortable?: boolean;
}

/**
 * Creates a date column formatted via lib/shared/utils — canonical source of truth.
 * Delegates to formatDate (date only) or formatDateTime (with time) from utils.
 *
 * Usage:
 *   createDateColumn<Payment>({
 *     key: "date",
 *     title: "Дата",
 *     accessor: (row) => row.date,
 *   })
 */
export function createDateColumn<T>(
  options: DateColumnOptions<T>
): ERPColumn<T> {
  const { key, title, accessor, showTime = false, width, sortable } = options;

  return {
    key,
    title,
    width,
    sortable,
    render: (_value, row) => {
      const raw = accessor(row);
      if (raw === null || raw === undefined) return "—";

      // Validate before passing to formatDate/formatDateTime
      const date = raw instanceof Date ? raw : new Date(raw as string);
      if (isNaN(date.getTime())) return String(raw);

      return showTime ? formatDateTime(date) : formatDate(date);
    },
  };
}

import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatRub } from "@/lib/shared/utils";

export interface MoneyColumnOptions<T> {
  key: string;
  title: string;
  /** Functional accessor — extracts the numeric value from a row */
  accessor: (row: T) => number | null | undefined;
  /** ISO 4217 currency code. Defaults to "RUB". */
  currency?: string;
  width?: number;
  sortable?: boolean;
}

/**
 * Formats a number as a currency string.
 * Returns "—" for null / undefined values.
 *
 * RUB (default): delegates to lib/shared/utils formatRub — canonical source of truth.
 * Other currencies: falls back to Intl.NumberFormat.
 *
 * Shared utility — use directly when you need a formatted string inside custom JSX.
 */
export function formatMoney(
  value: number | null | undefined,
  currency = "RUB"
): string {
  if (value === null || value === undefined) return "—";
  if (currency === "RUB") return formatRub(value);
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Creates a right-aligned money column using Intl.NumberFormat with RUB default.
 *
 * Usage:
 *   createMoneyColumn<Payment>({
 *     key: "amount",
 *     title: "Сумма",
 *     accessor: (row) => row.amount,
 *   })
 */
export function createMoneyColumn<T>(
  options: MoneyColumnOptions<T>
): ERPColumn<T> {
  const { key, title, accessor, currency = "RUB", width, sortable } = options;

  return {
    key,
    title,
    width,
    align: "right",
    sortable,
    render: (_value, row) => {
      const amount = accessor(row);
      return formatMoney(amount, currency);
    },
  };
}

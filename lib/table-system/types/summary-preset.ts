/**
 * Summary Preset Types
 *
 * Table footer/summary row configuration.
 *
 * Framework-agnostic. No React dependencies.
 */

import type { SummaryPosition, SummaryType } from "./shared-types";

// === SUMMARY COLUMN ===

/**
 * Summary configuration for a single column.
 */
export interface SummaryColumn {
  /**
   * Column ID to summarize.
   * Must match a column in the table preset.
   */
  columnId: string;

  /**
   * Aggregation type.
   * - sum: Total of values
   * - count: Number of rows
   * - avg: Average of values
   * - min: Minimum value
   * - max: Maximum value
   * - custom: Custom calculation
   */
  type: SummaryType;

  /**
   * Custom calculation function.
   * Required when type is "custom".
   */
  calculate?: (rows: unknown[]) => unknown;

  /**
   * Format the summary value.
   * Example: (value) => formatRub(value)
   */
  format?: (value: unknown) => string;

  /**
   * Label prefix.
   * Example: "Total:" -> "Total: 1,250,000 ₽"
   */
  label?: string;

  /**
   * CSS class for styling.
   */
  className?: string;
}

// === SUMMARY PRESET ===

/**
 * Complete summary configuration for a table.
 *
 * Design principles:
 * - Summary is optional (most tables don't need it)
 * - Can be server-side for large datasets
 * - Position is configurable (top/bottom)
 */
export interface SummaryPreset {
  /**
   * Where summary appears.
   * @default "bottom"
   */
  position?: SummaryPosition;

  /**
   * Columns to summarize.
   */
  columns: SummaryColumn[];

  /**
   * Use server-side aggregation.
   * Set to true for large datasets where client-side
   * calculation would be inaccurate or slow.
   */
  serverSide?: boolean;

  /**
   * Server aggregation endpoint.
   * Only used when serverSide is true.
   */
  endpoint?: string;

  /**
   * Sticky summary row.
   * Keeps summary visible while scrolling.
   * @default false
   */
  sticky?: boolean;

  /**
   * Show summary when no data.
   * @default false
   */
  showWhenEmpty?: boolean;
}

// === COMMON SUMMARY PRESETS ===

/**
 * Money total summary.
 * Common pattern for financial tables.
 */
export function createMoneySummary(
  columnId: string,
  options?: {
    label?: string;
    format?: (value: unknown) => string;
  }
): SummaryColumn {
  return {
    columnId,
    type: "sum",
    label: options?.label ?? "Итого:",
    format: options?.format,
  };
}

/**
 * Count summary.
 * Common pattern for document/item tables.
 */
export function createCountSummary(
  columnId: string,
  options?: {
    label?: string;
  }
): SummaryColumn {
  return {
    columnId,
    type: "count",
    label: options?.label ?? "Всего:",
  };
}

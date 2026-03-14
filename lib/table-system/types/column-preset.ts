/**
 * Column Preset Types
 *
 * Declarative column definition with stable identity.
 * TanStack-independent. No React dependencies.
 */

import type {
  CellRendererId,
  ColumnAlign,
  ColumnPin,
} from "./shared-types";

/**
 * Column definition for list tables.
 *
 * Design principles:
 * - Stable ID is REQUIRED (enables persistence, sorting, overrides)
 * - Declarative only (no JSX, no handlers)
 * - Framework-agnostic (no TanStack types)
 */
export interface ColumnPreset<TData = unknown> {
  // === IDENTITY (REQUIRED) ===

  /**
   * Stable column identifier.
   * REQUIRED even if accessorKey exists.
   * Used for: persistence keys, sorting params, overrides, testing.
   */
  id: string;

  // === DATA BINDING ===

  /**
   * Field path for automatic value extraction.
   * Supports nested paths: "counterparty.name"
   */
  accessorKey?: keyof TData | string;

  /**
   * Backend sort field name.
   * Use when backend expects different field name than id.
   * Example: id="totalAmount", sortField="total_amount"
   */
  sortField?: string;

  /**
   * Backend filter field name.
   * Use when backend expects different field name than id.
   */
  filterField?: string;

  // === DISPLAY ===

  /**
   * Column header label.
   * Should be i18n-ready.
   */
  header: string;

  /**
   * Default column width in pixels.
   */
  width: number;

  /**
   * Minimum width for resizing.
   */
  minWidth?: number;

  /**
   * Maximum width for resizing.
   */
  maxWidth?: number;

  // === BEHAVIOR ===

  /**
   * Enable sorting on this column.
   * @default true
   */
  sortable?: boolean;

  /**
   * Allow user to hide this column.
   * @default true
   */
  hideable?: boolean;

  /**
   * Allow column resize.
   * @default true
   */
  resizable?: boolean;

  /**
   * Text alignment within cells.
   * @default "left"
   */
  align?: ColumnAlign;

  /**
   * Pin column to edge.
   */
  pin?: ColumnPin;

  // === FORMATTING ===

  /**
   * Pure value formatter function.
   * For simple formatting without JSX.
   * Example: (value) => formatRub(value)
   */
  format?: (value: unknown, row: TData) => string;

  /**
   * Reference to shared cell renderer.
   * Renderers are implemented in UI layer.
   */
  cellRenderer?: CellRendererId;

  /**
   * Props passed to the cell renderer.
   * Enables parameterized renderers.
   * Example: { variantMap: { draft: "secondary" } }
   */
  cellRendererProps?: Record<string, unknown>;

  // === VISIBILITY ===

  /**
   * Show column by default.
   * @default true
   */
  defaultVisible?: boolean;

  /**
   * Mark as required column (cannot be hidden).
   * Use for critical identifier columns.
   * @default false
   */
  required?: boolean;
}

/**
 * Column override for page-level customization.
 * Only whitelisted properties can be overridden.
 */
export interface ColumnOverride {
  /** Override header label */
  header?: string;

  /** Override column width */
  width?: number;

  /** Override value formatter */
  format?: (value: unknown, row: unknown) => string;

  /** Override cell renderer */
  cellRenderer?: CellRendererId;

  /** Override cell renderer props */
  cellRendererProps?: Record<string, unknown>;
}

/**
 * Map of column overrides by column id.
 */
export interface ColumnOverrides {
  [columnId: string]: ColumnOverride;
}

/**
 * Computed column definition.
 * For columns that don't map directly to data fields.
 */
export interface ComputedColumnPreset<TData = unknown>
  extends Omit<ColumnPreset<TData>, "accessorKey" | "sortField" | "filterField"> {
  /**
   * Function to compute cell value.
   */
  compute: (row: TData) => unknown;

  /**
   * Optional sort field for computed columns.
   * Required if column is sortable.
   */
  sortField?: string;
}

/**
 * List Table Preset Types
 *
 * Top-level preset for read-only list/registry tables.
 * Combines columns, behavior, toolbar, actions, and summary.
 *
 * Framework-agnostic. No React dependencies.
 */

import type { TableMode, TableTier } from "./shared-types";
import type { ColumnPreset, ColumnOverrides } from "./column-preset";
import type { BehaviorPreset } from "./behavior-preset";
import type { ToolbarPreset } from "./toolbar-preset";
import type { ActionPreset, ActionHandlers, ActionPermissions } from "./action-preset";
import type { SummaryPreset } from "./summary-preset";

// === LIST TABLE PRESET ===

/**
 * Complete preset for a list table.
 *
 * Design principles:
 * - Single source of truth for table structure
 * - Declarative configuration
 * - Stable identity for persistence
 * - Mode is fixed to 'list' for v1
 */
export interface ListTablePreset<TData = unknown> {
  // === IDENTITY ===

  /**
   * Stable preset identifier.
   * Used for caching, debugging, documentation.
   * Example: "documents", "products", "counterparties"
   */
  id: string;

  // === MODE ===

  /**
   * Table operation mode.
   * Fixed to 'list' for v1.
   * 'editable' planned for v1.1.
   */
  mode: TableMode;

  // === COLUMNS ===

  /**
   * Canonical column set.
   * All columns must have stable IDs.
   */
  columns: ColumnPreset<TData>[];

  // === BEHAVIOR ===

  /**
   * Behavior configuration (sorting, pagination, selection).
   * Uses defaults if not specified.
   */
  behavior?: BehaviorPreset;

  // === TOOLBAR ===

  /**
   * Toolbar configuration (search, filters, actions).
   * Empty toolbar if not specified.
   */
  toolbar?: ToolbarPreset;

  // === ACTIONS ===

  /**
   * Row and bulk action descriptors.
   * Handlers provided separately by page layer.
   */
  actions?: ActionPreset<TData>;

  // === SUMMARY ===

  /**
   * Summary/footer configuration.
   * Optional, most tables don't need this.
   */
  summary?: SummaryPreset;

  // === PERSISTENCE ===

  /**
   * LocalStorage key prefix for column sizing/visibility.
   * Must be unique per table type.
   * Example: "documents-table" -> documents-table-sizing, documents-table-visibility
   */
  persistenceKey: string;

  // === METADATA ===

  /**
   * Tier classification for migration policy.
   * Used for tracking migration progress.
   */
  tier?: TableTier;

  /**
   * Human-readable name for documentation.
   */
  name?: string;

  /**
   * Description for documentation.
   */
  description?: string;
}

// === PRESET OPTIONS (Page Layer) ===

/**
 * Options for using a preset in a page.
 * Combines preset with page-specific handlers and overrides.
 */
export interface ListTablePresetOptions<TData = unknown> {
  /**
   * The preset to use.
   */
  preset: ListTablePreset<TData>;

  /**
   * Column overrides.
   * Only whitelisted properties can be overridden.
   */
  columnOverrides?: ColumnOverrides;

  /**
   * Action handlers.
   * Maps action IDs to implementation functions.
   */
  actionHandlers?: ActionHandlers<TData>;

  /**
   * Action permissions.
   * Controls visibility based on user permissions.
   */
  actionPermissions?: ActionPermissions<TData>;

  /**
   * Override default behavior.
   * Use sparingly, prefer preset defaults.
   */
  behaviorOverrides?: Partial<BehaviorPreset>;

  /**
   * Additional toolbar filters.
   * For page-specific filters not in preset.
   */
  additionalFilters?: ToolbarPreset["filters"];

  /**
   * Empty state message.
   * Overrides preset default.
   */
  emptyMessage?: string;

  /**
   * Loading state message.
   */
  loadingMessage?: string;
}

// === PRESET BUILDER ===

/**
 * Builder function type for creating presets.
 */
export type ListTablePresetBuilder<TData = unknown> = (
  options?: Partial<Omit<ListTablePreset<TData>, "id" | "mode" | "persistenceKey">>
) => ListTablePreset<TData>;

/**
 * Create a list table preset with defaults.
 */
export function createListTablePreset<TData = unknown>(
  config: Omit<ListTablePreset<TData>, "mode"> & { mode?: "list" }
): ListTablePreset<TData> {
  return {
    ...config,
    mode: "list",
    behavior: {
      sort: { defaultOrder: "asc", multiSort: false },
      pagination: { enabled: true, defaultSize: 25, sizeOptions: [10, 25, 50, 100], showSizeSelector: true },
      selection: { enabled: false, mode: "multi" },
      urlSync: { enabled: true },
      density: "compact",
      stickyHeader: true,
      ...config.behavior,
    },
    toolbar: config.toolbar ?? {},
    actions: config.actions ?? {},
  };
}

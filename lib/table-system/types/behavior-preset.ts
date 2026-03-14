/**
 * Behavior Preset Types
 *
 * Default behavior for sorting, pagination, filtering, and selection.
 *
 * Framework-agnostic. No React dependencies.
 */

import type { SelectionMode, TableDensity } from "./shared-types";

// === SORTING ===

/**
 * Sort configuration.
 */
export interface SortConfig {
  /** Default sort field (column id) */
  defaultField?: string;

  /** Default sort direction */
  defaultOrder?: "asc" | "desc";

  /** Allow multi-column sort */
  multiSort?: boolean;
}

// === PAGINATION ===

/**
 * Pagination configuration.
 */
export interface PaginationConfig {
  /** Enable pagination */
  enabled?: boolean;

  /** Default page size */
  defaultSize?: number;

  /** Available page size options */
  sizeOptions?: number[];

  /** Show page size selector */
  showSizeSelector?: boolean;
}

// === SELECTION ===

/**
 * Selection configuration.
 *
 * Note: Selection state is owned by page layer.
 * This config only defines behavior, not state.
 */
export interface SelectionConfig {
  /** Enable row selection */
  enabled?: boolean;

  /** Selection mode */
  mode?: SelectionMode;

  /**
   * Function to get row ID.
   * Required if selection is enabled.
   */
  getRowId?: (row: unknown) => string;
}

// === URL SYNC ===

/**
 * URL synchronization configuration.
 */
export interface UrlSyncConfig {
  /**
   * Sync state to URL for bookmarking/sharing.
   * @default true
   */
  enabled?: boolean;

  /**
   * URL param prefix for namespacing.
   * Example: "doc" -> ?doc_page=2&doc_sort=date
   */
  prefix?: string;

  /**
   * Params to sync.
   * @default ["page", "search", "sort", "filters"]
   */
  params?: string[];
}

// === BEHAVIOR PRESET ===

/**
 * Complete behavior configuration for a table.
 *
 * Design principles:
 * - Separates UX defaults from data semantics
 * - Selection is behavior config, not action config
 * - URL sync is opt-in per table
 */
export interface BehaviorPreset {
  // === SORTING ===

  /**
   * Sort configuration.
   */
  sort?: SortConfig;

  // === PAGINATION ===

  /**
   * Pagination configuration.
   * @default { enabled: true, defaultSize: 25 }
   */
  pagination?: PaginationConfig;

  // === SELECTION ===

  /**
   * Selection configuration.
   * Required for bulk actions.
   */
  selection?: SelectionConfig;

  // === URL SYNC ===

  /**
   * URL synchronization configuration.
   * @default { enabled: true }
   */
  urlSync?: UrlSyncConfig;

  // === DENSITY ===

  /**
   * Table density.
   * @default "compact"
   */
  density?: TableDensity;

  // === STICKY HEADER ===

  /**
   * Enable sticky header with scroll shadow.
   * @default true
   */
  stickyHeader?: boolean;
}

// === DEFAULT BEHAVIOR ===

/**
 * Default behavior preset.
 * Applied when no behavior is specified.
 */
export const DEFAULT_BEHAVIOR: BehaviorPreset = {
  sort: {
    defaultOrder: "asc",
    multiSort: false,
  },
  pagination: {
    enabled: true,
    defaultSize: 25,
    sizeOptions: [10, 25, 50, 100],
    showSizeSelector: true,
  },
  selection: {
    enabled: false,
    mode: "multi",
  },
  urlSync: {
    enabled: true,
  },
  density: "compact",
  stickyHeader: true,
};

// === MINIMAL BEHAVIOR ===

/**
 * Minimal behavior for simple tables.
 * No pagination, no selection.
 */
export const MINIMAL_BEHAVIOR: BehaviorPreset = {
  sort: {
    defaultOrder: "asc",
  },
  pagination: {
    enabled: false,
  },
  selection: {
    enabled: false,
  },
  urlSync: {
    enabled: false,
  },
  density: "compact",
  stickyHeader: false,
};

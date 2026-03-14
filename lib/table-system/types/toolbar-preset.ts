/**
 * Toolbar Preset Types
 *
 * Toolbar structure and view-level actions.
 * Includes toolbar actions (separate from row/bulk actions).
 *
 * Framework-agnostic. No React dependencies.
 */

import type {
  ActionKind,
  ActionVariant,
  ConfirmVariant,
  FilterType,
  IconName,
  TableDensity,
  ToolbarActionPlacement,
} from "./shared-types";

// === SEARCH ===

/**
 * Search configuration.
 */
export interface SearchConfig {
  /** Enable search input */
  enabled: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Fields to search in (for backend search) */
  fields?: string[];

  /** Debounce delay in milliseconds */
  debounce?: number;
}

// === FILTERS ===

/**
 * Filter option for select/radio filters.
 */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Filter control configuration.
 */
export interface FilterPreset {
  /** Unique filter identifier */
  id: string;

  /** Filter control type */
  type: FilterType;

  /** Filter label */
  label: string;

  /** Placeholder text */
  placeholder?: string;

  /** Options for select/tabs filters */
  options?: FilterOption[];

  /** Default value */
  defaultValue?: string;

  /** Backend filter field name (if different from id) */
  filterField?: string;
}

// === TOOLBAR ACTIONS ===

/**
 * Action in toolbar (Create, Import, Export, etc.).
 *
 * Design principles:
 * - View-level operations (not data operations)
 * - Independent of row state
 * - Defined here, not in ActionPreset
 */
export interface ToolbarActionDescriptor {
  // === IDENTITY ===

  /** Unique action identifier */
  id: string;

  // === DISPLAY ===

  /** Action label */
  label: string;

  /** Icon identifier (Lucide icon name) */
  icon?: IconName;

  // === KIND ===

  /**
   * Action type affects default behavior.
   * - navigate: Opens page (Create, View)
   * - mutation: Performs action (Import, Export)
   * - dialog: Opens dialog (Settings, Wizard)
   */
  kind: ActionKind;

  // === PLACEMENT ===

  /**
   * Where this action appears.
   * - primary: Main actions (Create) - prominent button
   * - secondary: Secondary actions (Export, Import)
   * - overflow: Less common actions in menu
   */
  placement: ToolbarActionPlacement;

  // === STYLING ===

  /** Button style variant */
  variant?: ActionVariant;

  // === CONFIRMATION ===

  /** Require confirmation before executing */
  requiresConfirm?: boolean;

  /** Confirmation dialog message */
  confirmMessage?: string;

  /** Confirmation dialog variant */
  confirmVariant?: ConfirmVariant;
}

// === TOOLBAR PRESET ===

/**
 * Complete toolbar configuration.
 *
 * Scope: Search, filters, toolbar actions, column settings.
 * Row/bulk actions are in ActionPreset.
 */
export interface ToolbarPreset {
  // === SEARCH ===

  /**
   * Search configuration.
   * Set to undefined or enabled: false to disable search.
   */
  search?: SearchConfig;

  // === FILTERS ===

  /**
   * Filter controls.
   * Rendered in order, before actions.
   */
  filters?: FilterPreset[];

  // === PRIMARY ACTIONS ===

  /**
   * Main toolbar actions (Create, Import).
   * Rendered as prominent buttons.
   */
  primaryActions?: ToolbarActionDescriptor[];

  // === SECONDARY ACTIONS ===

  /**
   * Secondary toolbar actions (Export, Settings).
   * Rendered as outline/ghost buttons.
   */
  secondaryActions?: ToolbarActionDescriptor[];

  // === COLUMN SETTINGS ===

  /**
   * Show column visibility/sizing menu.
   * @default true
   */
  columnSettings?: boolean;

  // === LAYOUT ===

  /**
   * Toolbar density.
   * @default "compact"
   */
  density?: TableDensity;
}

// === EMPTY TOOLBAR ===

/**
 * Empty toolbar preset for tables without toolbar.
 */
export const EMPTY_TOOLBAR: ToolbarPreset = {};

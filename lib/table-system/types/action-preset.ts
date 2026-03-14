/**
 * Action Preset Types
 *
 * Declarative action descriptors for row and bulk operations.
 * Toolbar actions are in ToolbarPreset (separation of concerns).
 *
 * Framework-agnostic. No React dependencies.
 */

import type {
  ActionKind,
  ActionPlacement,
  ActionVariant,
  ConfirmVariant,
  IconName,
} from "./shared-types";

// === ROW ACTIONS ===

/**
 * Action available on individual rows.
 *
 * Design principles:
 * - Preset defines structure and placement
 * - Page layer provides handlers and permissions
 * - Declarative only (no inline handlers)
 */
export interface RowActionDescriptor<TData = unknown> {
  // === IDENTITY ===

  /** Unique action identifier */
  id: string;

  // === DISPLAY ===

  /** Action label (shown in button/menu) */
  label: string;

  /** Icon identifier (Lucide icon name) */
  icon?: IconName;

  // === KIND ===

  /**
   * Action type affects default behavior.
   * - navigate: Opens page/modal (no confirmation needed)
   * - mutation: Modifies data (may need confirmation)
   * - dialog: Opens confirmation/input dialog
   */
  kind: ActionKind;

  // === PLACEMENT ===

  /**
   * Where this action appears.
   * - inline: Direct button in row
   * - menu: Inside dropdown menu
   * - overflow: Only in overflow menu
   */
  placement: ActionPlacement;

  // === VISIBILITY ===

  /**
   * Condition for showing the action.
   * Example: (row) => row.status === 'draft'
   */
  condition?: (row: TData) => boolean;

  // === STATE ===

  /**
   * Condition for enabling the action.
   * Action is visible but disabled when false.
   * Example: (row) => !row.isProcessing
   */
  enabled?: (row: TData) => boolean;

  // === CONFIRMATION ===

  /**
   * Require confirmation before executing.
   * Recommended for mutation actions.
   */
  requiresConfirm?: boolean;

  /** Confirmation dialog message */
  confirmMessage?: string;

  /** Confirmation dialog variant */
  confirmVariant?: ConfirmVariant;

  // === STYLING ===

  /** Button style variant */
  variant?: ActionVariant;

  /** Tooltip text */
  tooltip?: string;
}

// === BULK ACTIONS ===

/**
 * Action available on selected rows.
 *
 * Design principles:
 * - Appears in bulk action bar when rows selected
 * - No per-row conditions (applies to all selected)
 * - Usually requires confirmation
 */
export interface BulkActionDescriptor {
  // === IDENTITY ===

  /** Unique action identifier */
  id: string;

  // === DISPLAY ===

  /** Action label */
  label: string;

  /** Icon identifier */
  icon?: IconName;

  // === KIND ===

  /**
   * Action type.
   * - mutation: Modifies data (usually needs confirmation)
   * - dialog: Opens dialog with options
   */
  kind: "mutation" | "dialog";

  // === CONFIRMATION ===

  /**
   * Require confirmation before executing.
   * @default true for mutation actions
   */
  requiresConfirm?: boolean;

  /** Confirmation dialog message */
  confirmMessage?: string;

  /** Confirmation dialog variant */
  confirmVariant?: ConfirmVariant;

  // === STYLING ===

  /** Button style variant */
  variant?: ActionVariant;
}

// === ACTION PRESET ===

/**
 * Complete action configuration for a table.
 *
 * Scope: Row and bulk actions only.
 * Toolbar actions are in ToolbarPreset.
 */
export interface ActionPreset<TData = unknown> {
  /**
   * Actions available on individual rows.
   */
  rowActions?: RowActionDescriptor<TData>[];

  /**
   * Actions available on selected rows.
   * Only shown when rows are selected.
   */
  bulkActions?: BulkActionDescriptor[];
}

// === ACTION HANDLERS (Page Layer) ===

/**
 * Action handlers provided by page layer.
 * Maps action IDs to implementation functions.
 */
export interface ActionHandlers<TData = unknown> {
  /**
   * Row action handlers.
   * Key: action id. Value: handler function.
   */
  rowActions?: {
    [actionId: string]: (row: TData) => void | Promise<void>;
  };

  /**
   * Bulk action handlers.
   * Key: action id. Value: handler function with selected IDs.
   */
  bulkActions?: {
    [actionId: string]: (selectedIds: Set<string>) => void | Promise<void>;
  };

  /**
   * Toolbar action handlers.
   * Key: action id. Value: handler function.
   */
  toolbarActions?: {
    [actionId: string]: () => void | Promise<void>;
  };
}

// === ACTION PERMISSIONS (Page Layer) ===

/**
 * Permission checks provided by page layer.
 * Controls visibility and enabled state based on user permissions.
 */
export interface ActionPermissions<TData = unknown> {
  /**
   * Row action permissions.
   * Return false to hide action for this row.
   */
  rowActions?: {
    [actionId: string]: (row: TData) => boolean;
  };

  /**
   * Bulk action permissions.
   * Return false to hide action entirely.
   */
  bulkActions?: {
    [actionId: string]: boolean;
  };

  /**
   * Toolbar action permissions.
   * Return false to hide action entirely.
   */
  toolbarActions?: {
    [actionId: string]: boolean;
  };
}

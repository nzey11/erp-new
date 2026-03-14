/**
 * Shared types for ERP Table System v1
 *
 * Framework-agnostic contracts.
 * No React dependencies allowed in this file.
 */

// === CELL RENDERERS ===

/**
 * Identifier for shared cell renderers.
 * Renderers are implemented in UI layer, referenced by ID in presets.
 */
export type CellRendererId =
  | "money"
  | "number"
  | "date"
  | "datetime"
  | "status"
  | "statusBadge"
  | "partyLink"
  | "linkBadges" // Renders multiple link badges in one cell
  | "documentNumber"
  | "productName"
  | "badge"
  | "image"
  | "boolean"
  | "text";

/**
 * Icon identifier.
 * Maps to Lucide icon names in UI layer.
 */
export type IconName = string;

// === ACTION KINDS ===

/**
 * Classification of action behavior.
 * Affects default handling and UI presentation.
 */
export type ActionKind = "navigate" | "mutation" | "dialog";

/**
 * Action placement location.
 */
export type ActionPlacement = "inline" | "menu" | "overflow";

/**
 * Toolbar action placement.
 */
export type ToolbarActionPlacement = "primary" | "secondary" | "overflow";

// === STYLE VARIANTS ===

/**
 * Button/action style variant.
 */
export type ActionVariant = "default" | "outline" | "ghost" | "destructive";

/**
 * Confirmation dialog variant.
 */
export type ConfirmVariant = "default" | "destructive";

// === TABLE MODE ===

/**
 * Table operation mode.
 * v1 supports 'list' only. 'editable' planned for v1.1.
 */
export type TableMode = "list" | "editable";

// === TIER CLASSIFICATION ===

/**
 * Migration tier for table adoption policy.
 */
export type TableTier = "tier1" | "tier2" | "tier3";

// === ALIGNMENT ===

/**
 * Text alignment within cells.
 */
export type ColumnAlign = "left" | "center" | "right";

/**
 * Column pin position.
 */
export type ColumnPin = "left" | "right";

// === DENSITY ===

/**
 * Table density mode.
 */
export type TableDensity = "compact" | "normal";

// === SELECTION ===

/**
 * Row selection mode.
 */
export type SelectionMode = "single" | "multi";

// === SUMMARY ===

/**
 * Summary calculation type.
 */
export type SummaryType = "sum" | "count" | "avg" | "min" | "max" | "custom";

/**
 * Summary position.
 */
export type SummaryPosition = "top" | "bottom";

// === FILTER ===

/**
 * Filter control type.
 */
export type FilterType = "select" | "date" | "dateRange" | "text" | "tabs" | "checkbox";

// === MATURITY LEVELS ===

/**
 * Migration maturity level.
 */
export type MigrationLevel = "adapter-based" | "preset-compliant" | "fully-standardized";

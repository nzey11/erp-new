/**
 * ERP Table System v1 - Types
 *
 * Framework-agnostic contracts for table presets.
 * No React dependencies.
 *
 * Architecture:
 * - Types (this directory): Pure TypeScript interfaces
 * - Presets (/lib/table-system/presets): Domain-specific preset implementations
 * - Renderers (/lib/table-system/renderers): Shared cell renderers (React components)
 * - Adapter (/components/ui/data-grid/preset-adapter.ts): Preset → DataGridProps transformation
 */

// === Shared Types ===
export type {
  CellRendererId,
  IconName,
  ActionKind,
  ActionPlacement,
  ToolbarActionPlacement,
  ActionVariant,
  ConfirmVariant,
  TableMode,
  TableTier,
  ColumnAlign,
  ColumnPin,
  TableDensity,
  SelectionMode,
  SummaryType,
  SummaryPosition,
  FilterType,
  MigrationLevel,
} from "./shared-types";

// === Column Preset ===
export type {
  ColumnPreset,
  ColumnOverride,
  ColumnOverrides,
  ComputedColumnPreset,
} from "./column-preset";

// === Behavior Preset ===
export type {
  SortConfig,
  PaginationConfig,
  SelectionConfig,
  UrlSyncConfig,
  BehaviorPreset,
} from "./behavior-preset";
export { DEFAULT_BEHAVIOR, MINIMAL_BEHAVIOR } from "./behavior-preset";

// === Toolbar Preset ===
export type {
  SearchConfig,
  FilterOption,
  FilterPreset,
  ToolbarActionDescriptor,
  ToolbarPreset,
} from "./toolbar-preset";
export { EMPTY_TOOLBAR } from "./toolbar-preset";

// === Action Preset ===
export type {
  RowActionDescriptor,
  BulkActionDescriptor,
  ActionPreset,
  ActionHandlers,
  ActionPermissions,
} from "./action-preset";

// === Summary Preset ===
export type {
  SummaryColumn,
  SummaryPreset,
} from "./summary-preset";
export { createMoneySummary, createCountSummary } from "./summary-preset";

// === List Table Preset ===
export type {
  ListTablePreset,
  ListTablePresetOptions,
  ListTablePresetBuilder,
} from "./list-table-preset";
export { createListTablePreset } from "./list-table-preset";

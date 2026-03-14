/**
 * Preset Adapter
 *
 * Transforms ListTablePreset to DataGridProps.
 * SINGLE POINT OF INTEGRATION between preset system and DataGrid.
 *
 * Design principles:
 * - Preset = declaration
 * - Adapter = translation to TanStack
 * - DataGrid = rendering
 */

import type { DataGridColumn } from "@/components/ui/data-grid";
import type {
  ListTablePreset,
  ColumnPreset,
  ColumnOverrides,
  ActionHandlers,
  ActionPermissions,
} from "@/lib/table-system/types";
import { getCellRenderer } from "@/lib/table-system/renderers";

// === ADAPTER RESULT ===

/**
 * Result of adapting a preset to DataGrid props.
 */
export interface AdaptedPreset<TData> {
  /** Transformed columns for DataGrid */
  columns: DataGridColumn<TData>[];

  /** Default sort configuration */
  defaultSort?: {
    id: string;
    desc: boolean;
  };

  /** Pagination configuration */
  pagination?: {
    defaultSize: number;
    sizeOptions: number[];
  };

  /** Persistence key for column sizing/visibility */
  persistenceKey: string;
}

// === COLUMN ADAPTATION ===

/**
 * Transform a single ColumnPreset to DataGridColumn.
 */
function adaptColumn<TData>(
  columnPreset: ColumnPreset<TData>,
  override?: ColumnOverrides[string]
): DataGridColumn<TData> {
  const merged = override
    ? {
        ...columnPreset,
        header: override.header ?? columnPreset.header,
        width: override.width ?? columnPreset.width,
        cellRenderer: override.cellRenderer ?? columnPreset.cellRenderer,
        cellRendererProps: override.cellRendererProps ?? columnPreset.cellRendererProps,
      }
    : columnPreset;

  const column: DataGridColumn<TData> = {
    id: merged.id,
    accessorKey: merged.accessorKey as string,
    header: merged.header,
    size: merged.width,
    minSize: merged.minWidth,
    maxSize: merged.maxWidth,
    enableSorting: merged.sortable ?? true,
    enableResizing: merged.resizable ?? true,
    meta: {
      align: merged.align,
      canHide: (merged.hideable ?? true) && !merged.required,
      pin: merged.pin,
      label: merged.header,
    },
  };

  // Apply cell renderer if specified
  if (merged.cellRenderer || merged.format) {
    column.cell = ({ row }) => {
      const value = merged.accessorKey
        ? getNestedValue(row.original, merged.accessorKey as string)
        : undefined;

      // Use format function if provided
      if (merged.format) {
        return merged.format(value, row.original);
      }

      // Use cell renderer from registry
      if (merged.cellRenderer) {
        const Renderer = getCellRenderer(merged.cellRenderer);
        if (Renderer) {
          return (
            <Renderer
              value={value}
              row={row.original}
              props={merged.cellRendererProps ?? {}}
            />
          );
        }
      }

      // Fallback: return the value as string
      return value != null ? String(value) : "—";
    };
  }

  return column;
}

/**
 * Get nested value from object by path.
 * Supports paths like "counterparty.name"
 */
function getNestedValue<T>(obj: T, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// === MAIN ADAPTER ===

/**
 * Adapt ListTablePreset to DataGrid props.
 *
 * This is the ONLY function that transforms presets to DataGrid columns.
 * All preset-based tables must go through this adapter.
 */
export function adaptPreset<TData>(
  preset: ListTablePreset<TData>,
  options?: {
    columnOverrides?: ColumnOverrides;
    actionHandlers?: ActionHandlers<TData>;
    actionPermissions?: ActionPermissions<TData>;
  }
): AdaptedPreset<TData> {
  // 1. Transform columns
  const columns: DataGridColumn<TData>[] = preset.columns.map((col) =>
    adaptColumn(col, options?.columnOverrides?.[col.id])
  );

  // 2. Add action column if row actions exist
  // TODO: Implement action column generation when action model is ready
  // if (preset.actions?.rowActions?.length) {
  //   columns.push(createActionColumn(preset.actions.rowActions, options));
  // }

  // 3. Extract behavior defaults
  const behavior = preset.behavior ?? {};
  const defaultSort = behavior.sort?.defaultField
    ? {
        id: behavior.sort.defaultField,
        desc: behavior.sort.defaultOrder === "desc",
      }
    : undefined;

  const pagination = behavior.pagination?.enabled !== false
    ? {
        defaultSize: behavior.pagination?.defaultSize ?? 25,
        sizeOptions: behavior.pagination?.sizeOptions ?? [10, 25, 50, 100],
      }
    : undefined;

  return {
    columns,
    defaultSort,
    pagination,
    persistenceKey: preset.persistenceKey,
  };
}

// === ACTION COLUMN (TODO) ===

/**
 * Create action column from row action descriptors.
 * Will be implemented when action model is ready.
 */
// function createActionColumn<TData>(
//   actions: RowActionDescriptor<TData>[],
//   options?: {
//     actionHandlers?: ActionHandlers<TData>;
//     actionPermissions?: ActionPermissions<TData>;
//   }
// ): DataGridColumn<TData> {
//   // Implementation pending
// }

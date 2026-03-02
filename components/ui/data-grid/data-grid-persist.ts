import type { ColumnSizingState, VisibilityState } from "@tanstack/react-table";

function getKey(prefix: string, persistenceKey: string) {
  return `datagrid-${prefix}-${persistenceKey}`;
}

export function loadColumnSizing(persistenceKey: string): ColumnSizingState {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(getKey("sizing", persistenceKey));
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

export function saveColumnSizing(persistenceKey: string, sizing: ColumnSizingState) {
  try {
    localStorage.setItem(getKey("sizing", persistenceKey), JSON.stringify(sizing));
  } catch { /* ignore */ }
}

export function loadColumnVisibility(persistenceKey: string): VisibilityState {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(getKey("visibility", persistenceKey));
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

export function saveColumnVisibility(persistenceKey: string, visibility: VisibilityState) {
  try {
    localStorage.setItem(getKey("visibility", persistenceKey), JSON.stringify(visibility));
  } catch { /* ignore */ }
}

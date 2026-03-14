/**
 * Table System v1 Feature Flags
 *
 * Controls rollout of preset-driven tables.
 * Per-table opt-in for safe migration.
 */

export const TABLE_SYSTEM_V1 = {
  /**
   * Master switch for table system v1.
   * Set to false to disable all preset-driven tables.
   */
  enabled: true,

  /**
   * Per-table feature flags.
   * Set to true to enable preset-driven rendering.
   */
  tables: {
    /**
     * CRM Party List Table
     * First PoC for table system v1.
     */
    partyListTable: true,

    /**
     * Counterparties Table
     * Second migration target (Level 1+).
     */
    counterpartiesTable: false,

    // Future migrations (set to false until migrated)
    documentsTable: false,
    productsTable: false,
    salesTable: false,
    purchasesTable: false,
    variantsTable: false,
    cmsPagesTable: false,
    financeBalances: false,
  },

  /**
   * Debug mode for development.
   * Shows both legacy and preset versions side-by-side.
   */
  debug: {
    enabled: false,
    showBoth: false, // Render both versions for comparison
  },
} as const;

/**
 * Type for table feature flags.
 */
export type TableFeatureFlags = typeof TABLE_SYSTEM_V1.tables;

/**
 * Check if a table should use preset-driven rendering.
 */
export function usePresetTable(tableId: keyof TableFeatureFlags): boolean {
  return TABLE_SYSTEM_V1.enabled && TABLE_SYSTEM_V1.tables[tableId];
}

/**
 * Check if debug mode is enabled.
 */
export function isTableSystemDebug(): boolean {
  return TABLE_SYSTEM_V1.debug.enabled;
}

/**
 * Check if both versions should be shown (debug only).
 */
export function showBothTables(): boolean {
  return TABLE_SYSTEM_V1.debug.enabled && TABLE_SYSTEM_V1.debug.showBoth;
}

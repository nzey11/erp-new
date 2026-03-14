/**
 * Build Party List Query String
 *
 * Constructs URL query string from PartyListParams.
 * Centralizes URL building logic for filters, pagination, and reset actions.
 */

import type { PartyListParams } from "./types";

interface BuildQueryStringOptions {
  /** Override specific params (e.g., change page) */
  overrides?: Partial<PartyListParams>;
  /** Reset page to 1 when filters change (default: true for filter changes) */
  resetPage?: boolean;
}

/**
 * Build a URL query string from party list parameters.
 *
 * Rules:
 * - Removes undefined/empty parameters
 * - By default, resets page to 1 (for filter changes)
 * - Set resetPage: false to preserve page (for pagination links)
 */
export function buildPartyListQueryString(
  params: PartyListParams,
  options: BuildQueryStringOptions = {}
): string {
  const { overrides = {}, resetPage = true } = options;

  // Merge params with overrides
  const merged: PartyListParams = {
    ...params,
    ...overrides,
  };

  // Reset page to 1 unless explicitly preserving it
  const finalPage = resetPage ? 1 : merged.page;

  // Build URLSearchParams, excluding undefined/empty values
  const searchParams = new URLSearchParams();

  if (merged.search && merged.search.length > 0) {
    searchParams.set("search", merged.search);
  }

  if (merged.type) {
    searchParams.set("type", merged.type);
  }

  if (merged.ownerId && merged.ownerId.length > 0) {
    searchParams.set("owner", merged.ownerId);
  }

  if (finalPage > 1) {
    searchParams.set("page", String(finalPage));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Build query string for pagination link (preserves filters, changes page).
 */
export function buildPaginationQueryString(
  params: PartyListParams,
  targetPage: number
): string {
  return buildPartyListQueryString(params, {
    overrides: { page: targetPage },
    resetPage: false,
  });
}

/**
 * Build query string for filter change (resets page to 1).
 */
export function buildFilterQueryString(
  params: PartyListParams,
  filterOverrides: Partial<PartyListParams>
): string {
  return buildPartyListQueryString(params, {
    overrides: filterOverrides,
    resetPage: true,
  });
}

/**
 * Build query string for reset (clears all filters).
 */
export function buildResetQueryString(): string {
  return "";
}

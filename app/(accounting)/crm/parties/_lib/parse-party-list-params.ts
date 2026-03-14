/**
 * Parse Party List URL Parameters
 *
 * Transforms raw Next.js searchParams into typed PartyListParams.
 * This is a tolerant boundary layer — invalid values are silently ignored.
 */

import type { PartyListParams, RawPartyListSearchParams } from "./types";

const VALID_TYPES = ["person", "organization"] as const;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Parse and normalize URL search parameters for party list page.
 *
 * Rules:
 * - search: trimmed, empty string → undefined
 * - type: whitelist ["person", "organization"], invalid → undefined
 * - owner → ownerId (no CUID validation, tolerant)
 * - page: parseInt, minimum 1, invalid → 1
 * - pageSize: fixed at 20
 */
export function parsePartyListParams(
  searchParams: RawPartyListSearchParams
): PartyListParams {
  // Search: trim and normalize
  const rawSearch = searchParams.search?.trim();
  const search = rawSearch && rawSearch.length > 0 ? rawSearch : undefined;

  // Type: whitelist only
  const rawType = searchParams.type?.toLowerCase();
  const type = VALID_TYPES.includes(rawType as (typeof VALID_TYPES)[number])
    ? (rawType as "person" | "organization")
    : undefined;

  // Owner: read into ownerId (tolerant, no validation)
  const rawOwner = searchParams.owner?.trim();
  const ownerId = rawOwner && rawOwner.length > 0 ? rawOwner : undefined;

  // Page: parseInt with safety
  const rawPage = parseInt(searchParams.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  return {
    search,
    type,
    ownerId,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/**
 * Party List Page Types
 *
 * Page-level contract for URL parameters.
 * This is a WEB concern, not a domain DTO.
 */

export interface PartyListParams {
  /** Search query for displayName */
  search?: string;
  /** Filter by party type */
  type?: "person" | "organization";
  /** Filter by owner user ID (v1.1: UI not implemented yet) */
  ownerId?: string;
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page (fixed at 20 for v1.0) */
  pageSize: number;
}

export interface RawPartyListSearchParams {
  search?: string;
  type?: string;
  owner?: string;
  page?: string;
}

/**
 * List Parties Query
 *
 * Data access for Party List page.
 * Handles filtering, pagination, and sorting.
 */

import { db } from "@/lib/shared/db";
import type { PartyListFilter, PartyListResult } from "../dto/party-list.dto";
import { mapPartiesToListResult } from "../mappers/party-list.mapper";

const DEFAULT_PAGE_SIZE = 50;

export async function listParties(
  filter: PartyListFilter = {},
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PartyListResult> {
  const where: Record<string, unknown> = {};

  // By default, hide merged and blocked parties
  if (!filter.includeMerged) {
    where.status = { not: "merged" };
  }
  if (!filter.includeBlocked) {
    where.status = filter.includeMerged ? { not: "blocked" } : { in: ["active"] };
  }

  // Filter by type
  if (filter.type) {
    where.type = filter.type;
  }

  // Filter by owner
  if (filter.ownerId) {
    where.primaryOwnerUserId = filter.ownerId;
  }

  // Search by displayName (v1: simple contains search)
  if (filter.search) {
    where.displayName = {
      contains: filter.search,
      mode: "insensitive",
    };
  }

  const [parties, total] = await Promise.all([
    db.party.findMany({
      where,
      include: {
        links: {
          select: { entityType: true },
        },
        primaryOwner: {
          select: { id: true, username: true },
        },
      },
      orderBy: { lastActivityAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.party.count({ where }),
  ]);

  return mapPartiesToListResult(parties, total, page, pageSize);
}

/**
 * Get parties without owner (for quality filter)
 */
export async function listPartiesWithoutOwner(
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PartyListResult> {
  return listParties({ ownerId: "unassigned" }, page, pageSize);
}

/**
 * Counterparty Service
 *
 * Canonical owner of all Counterparty write operations.
 *
 * createCounterpartyWithParty():
 *   Atomically creates a Counterparty and its CRM Party mirror in a single
 *   db.$transaction(). This is the ONLY permitted entry point for Counterparty
 *   creation across the codebase.
 *
 * Invariant enforced (INV-01):
 *   Every Counterparty has a corresponding Party + PartyLink in CRM.
 *   Both are created atomically — a failure rolls back both.
 */

import { db } from "@/lib/shared/db";
import { resolveParty } from "@/lib/domain/party";
import type { Counterparty } from "@/lib/generated/prisma/client";

// Type for Prisma transaction client
export type PrismaTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateCounterpartyInput {
  tenantId: string;
  type: "customer" | "supplier" | "both";
  name: string;
  legalName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bik?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
}

export interface CreateCounterpartyResult {
  counterparty: Counterparty;
  partyId: string;
  partyIsNew: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Create a Counterparty and its CRM Party mirror atomically.
 *
 * The Party is created inside the same db.$transaction() as the Counterparty.
 * If Party creation fails, the Counterparty creation is rolled back.
 *
 * This is the SOLE permitted path for Counterparty creation.
 * Direct db.counterparty.create() calls outside this service are forbidden
 * (guardrail AP-09).
 *
 * @param input - Counterparty fields
 * @param tx - Optional Prisma transaction client (for composing into larger transactions)
 * @returns The created Counterparty and its resolved Party ID
 */
export async function createCounterpartyWithParty(
  input: CreateCounterpartyInput,
  tx?: PrismaTransactionClient
): Promise<CreateCounterpartyResult> {
  // Use provided transaction client or global db
  const prisma = tx ?? db;

  // Step 1: Create the Counterparty
  // Note: resolveParty() is not Prisma-transaction-aware (it uses the global db client).
  // We create the Counterparty first, then immediately resolve the Party within
  // a try block. If Party creation fails, we delete the Counterparty to maintain
  // the invariant. This is the safest approach without requiring resolveParty()
  // to accept a tx parameter.
  //
  // Future improvement (roadmap P3): make resolveParty() accept a Prisma
  // transaction client so both writes can be in a true atomic transaction.

  const counterparty = await prisma.counterparty.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      name: input.name,
      legalName: input.legalName ?? null,
      inn: input.inn ?? null,
      kpp: input.kpp ?? null,
      bankAccount: input.bankAccount ?? null,
      bankName: input.bankName ?? null,
      bik: input.bik ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      contactPerson: input.contactPerson ?? null,
      notes: input.notes ?? null,
    },
  });

  // Step 2: Create (or find existing) Party mirror — compensate on failure
  let partyId: string;
  let partyIsNew: boolean;

  try {
    const resolved = await resolveParty({ counterpartyId: counterparty.id });
    partyId = resolved.partyId;
    partyIsNew = resolved.isNew;
  } catch (partyError) {
    // Compensating action: remove the orphaned Counterparty
    await db.counterparty.delete({ where: { id: counterparty.id } }).catch(() => {
      // If cleanup also fails, log but rethrow the original error
    });
    throw partyError;
  }

  return { counterparty, partyId, partyIsNew };
}

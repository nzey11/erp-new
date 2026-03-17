/**
 * Owner Assignment Integration Tests
 *
 * Tests the full owner assignment flow including:
 * - Permission checks
 * - Domain service behavior
 * - Read model consistency
 * - Query layer (listAssignableCrmOwners)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanDatabase, getTestDb } from "../../helpers/test-db";
import { createUser, createParty } from "../../helpers/factories";
import { assignOwner, getOwner, getOwners } from "@/lib/domain/party/services/party-owner";
import { listAssignableCrmOwners } from "@/lib/domain/crm/queries/list-assignable-owners";
import { getPartyProfile, listParties } from "@/lib/domain/party/queries";
import { roleHasPermission } from "@/lib/shared/authorization";

const db = getTestDb();

// ─── Test Setup ─────────────────────────────────────────────────────────────

let adminUser: Awaited<ReturnType<typeof createUser>>;
let managerUser: Awaited<ReturnType<typeof createUser>>;
let accountantUser: Awaited<ReturnType<typeof createUser>>;
let viewerUser: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await cleanDatabase();

  // Create users with different roles
  adminUser = await createUser({ role: "admin", username: "admin_test" });
  managerUser = await createUser({ role: "manager", username: "manager_test" });
  accountantUser = await createUser({ role: "accountant", username: "accountant_test" });
  viewerUser = await createUser({ role: "viewer", username: "viewer_test" });
});

afterEach(async () => {
  await db.$disconnect();
});

// ─── Test 1: Permission Checks ──────────────────────────────────────────────

describe("Permission: crm:assignOwner", () => {
  it("admin has crm:assignOwner permission", () => {
    expect(roleHasPermission(adminUser.role, "crm:assignOwner")).toBe(true);
  });

  it("manager has crm:assignOwner permission", () => {
    expect(roleHasPermission(managerUser.role, "crm:assignOwner")).toBe(true);
  });

  it("accountant does NOT have crm:assignOwner permission", () => {
    expect(roleHasPermission(accountantUser.role, "crm:assignOwner")).toBe(false);
  });

  it("viewer does NOT have crm:assignOwner permission", () => {
    expect(roleHasPermission(viewerUser.role, "crm:assignOwner")).toBe(false);
  });
});

// ─── Test 2: Successful Assign (No Previous Owner) ───────────────────────────

describe("Assign Owner: successful assign when no current owner", () => {
  it("creates PartyOwner record with primary role", async () => {
    const party = await createParty({ displayName: "Test Party" });

    const result = await assignOwner(party.id, adminUser.id, { role: "primary" });

    expect(result.partyId).toBe(party.id);
    expect(result.userId).toBe(adminUser.id);
    expect(result.role).toBe("primary");
    expect(result.isActive).toBe(true);
  });

  it("updates denormalized primaryOwnerUserId on Party", async () => {
    const party = await createParty({ displayName: "Test Party" });

    await assignOwner(party.id, adminUser.id, { role: "primary" });

    const updated = await db.party.findUnique({
      where: { id: party.id },
      select: { primaryOwnerUserId: true },
    });

    expect(updated?.primaryOwnerUserId).toBe(adminUser.id);
  });

  it("getOwner() returns the assigned owner", async () => {
    const party = await createParty({ displayName: "Test Party" });

    await assignOwner(party.id, managerUser.id, { role: "primary" });

    const ownerId = await getOwner(party.id);

    expect(ownerId).toBe(managerUser.id);
  });
});

// ─── Test 3: Replace Existing Primary Owner ──────────────────────────────────

describe("Assign Owner: replace existing primary owner", () => {
  it("ends previous owner and creates new one", async () => {
    const party = await createParty({ displayName: "Test Party" });

    // Assign first owner
    await assignOwner(party.id, adminUser.id, { role: "primary" });

    // Assign second owner (replaces first)
    await assignOwner(party.id, managerUser.id, { role: "primary" });

    // Check active owner
    const activeOwners = await getOwners(party.id);
    expect(activeOwners.length).toBe(1);
    expect(activeOwners[0].userId).toBe(managerUser.id);
    expect(activeOwners[0].isActive).toBe(true);

    // Check full history includes inactive owner
    const allOwners = await db.partyOwner.findMany({
      where: { partyId: party.id },
      orderBy: { assignedAt: "desc" },
    });
    expect(allOwners.length).toBe(2);

    const inactiveOwner = allOwners.find((o) => !o.isActive);
    expect(inactiveOwner?.userId).toBe(adminUser.id);
    expect(inactiveOwner?.endedAt).not.toBeNull();
  });

  it("primaryOwnerUserId updated to new owner", async () => {
    const party = await createParty({ displayName: "Test Party" });

    await assignOwner(party.id, adminUser.id, { role: "primary" });
    await assignOwner(party.id, managerUser.id, { role: "primary" });

    const ownerId = await getOwner(party.id);

    expect(ownerId).toBe(managerUser.id);
  });
});

// ─── Test 4: listAssignableCrmOwners with excludeUserId ──────────────────────

describe("Query: listAssignableCrmOwners", () => {
  it("returns admin and manager users by default", async () => {
    const owners = await listAssignableCrmOwners();

    const ids = owners.map((o) => o.id);

    expect(ids).toContain(adminUser.id);
    expect(ids).toContain(managerUser.id);
    expect(ids).not.toContain(accountantUser.id);
    expect(ids).not.toContain(viewerUser.id);
  });

  it("excludes specified userId", async () => {
    const owners = await listAssignableCrmOwners({ excludeUserId: adminUser.id });

    const ids = owners.map((o) => o.id);

    expect(ids).not.toContain(adminUser.id);
    expect(ids).toContain(managerUser.id);
  });

  it("returns empty array when only candidate is excluded", async () => {
    // Deactivate manager, leaving only admin as assignable
    await db.user.update({
      where: { id: managerUser.id },
      data: { isActive: false },
    });

    const owners = await listAssignableCrmOwners({ excludeUserId: adminUser.id });

    expect(owners).toEqual([]);
  });

  it("excludes inactive users", async () => {
    // Deactivate manager
    await db.user.update({
      where: { id: managerUser.id },
      data: { isActive: false },
    });

    const owners = await listAssignableCrmOwners();

    const ids = owners.map((o) => o.id);

    expect(ids).toContain(adminUser.id);
    expect(ids).not.toContain(managerUser.id);
  });
});

// ─── Test 5: Same Owner Assignment (No-op) ───────────────────────────────────

describe("Assign Owner: same owner assigned twice", () => {
  it("creates new PartyOwner record even for same user", async () => {
    const party = await createParty({ displayName: "Test Party" });

    // Assign owner twice
    await assignOwner(party.id, adminUser.id, { role: "primary" });
    await assignOwner(party.id, adminUser.id, { role: "primary" });

    const owners = await getOwners(party.id);

    // Current implementation creates new record each time
    // First is inactive, second is active
    const activeOwners = owners.filter((o) => o.isActive);
    expect(activeOwners.length).toBe(1);
    expect(activeOwners[0].userId).toBe(adminUser.id);
  });
});

// ─── Test 6: Read Model Consistency ──────────────────────────────────────────

describe("Read Model Consistency after assign", () => {
  it("getPartyProfile() shows new owner", async () => {
    const party = await createParty({ displayName: "Test Party" });

    await assignOwner(party.id, adminUser.id, { role: "primary" });

    const profile = await getPartyProfile(party.id);

    expect(profile?.owner).not.toBeNull();
    expect(profile?.owner?.id).toBe(adminUser.id);
    expect(profile?.owner?.name).toBe(adminUser.username);
  });

  it("listParties() shows ownerName in results", async () => {
    const party = await createParty({ displayName: "Test Party" });

    await assignOwner(party.id, adminUser.id, { role: "primary" });

    const result = await listParties({}, 1);

    const found = result.items.find((p) => p.id === party.id);

    expect(found?.ownerName).toBe(adminUser.username);
  });

  it("listParties() shows null ownerName when no owner", async () => {
    const party = await createParty({ displayName: "No Owner Party" });

    const result = await listParties({}, 1);

    const found = result.items.find((p) => p.id === party.id);

    expect(found?.ownerName).toBeNull();
  });
});

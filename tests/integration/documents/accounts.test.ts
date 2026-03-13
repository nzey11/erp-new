/**
 * Integration tests for lib/modules/accounting/accounts.ts
 * Covers: createAccount, deleteAccount (guards), getAccountBalance (accounts module)
 *
 * IMPORTANT: cleanDatabase() does NOT delete Account rows (they survive as
 * semi-static master data — see journal.test.ts assumption).  All codes used
 * here use the "ZZ." prefix guaranteed to be absent from seed-accounts.ts,
 * and each test uses a unique suffix so codes never collide across tests.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { cleanDatabase, getTestDb } from "../../helpers/test-db";
import { createAccount, deleteAccount, getAccountBalance } from "@/lib/modules/accounting/accounts";
import { AccountType, AccountCategory } from "@/lib/generated/prisma/client";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function mkAccount(code: string, extra?: { isSystem?: boolean; parentId?: string }) {
  const db = getTestDb();
  return db.account.create({
    data: {
      code,
      name: `Test ${code}`,
      type: AccountType.active,
      category: AccountCategory.asset,
      isSystem: extra?.isSystem ?? false,
      isActive: true,
      parentId: extra?.parentId,
    },
  });
}

async function seedLedgerLine(accountId: string, debit: number, credit: number, entryNum: string, date: Date) {
  const db = getTestDb();
  await db.journalEntry.create({
    data: {
      number: entryNum,
      date,
      isReversed: false,
      lines: {
        create: [{ accountId, debit, credit }],
      },
    },
  });
}

// ─── suites ───────────────────────────────────────────────────────────────────

describe("accounting/accounts — createAccount", () => {
  beforeAll(async () => {
    // Remove any ZZ. accounts left by previous runs (accounts survive cleanDatabase)
    await getTestDb().account.deleteMany({ where: { code: { startsWith: "ZZ." } } });
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  // Each test uses a unique "ZZ.CxNNN" code to avoid collisions with seed data
  // and with other tests (accounts survive cleanDatabase across tests in file).

  it("creates an account with required fields", async () => {
    const account = await createAccount({
      code: "ZZ.CA001",
      name: "Test Account",
      type: AccountType.active,
      category: AccountCategory.asset,
    });
    expect(account.code).toBe("ZZ.CA001");
    expect(account.isSystem).toBe(false);
    expect(account.isActive).toBe(true);
  });

  it("throws when account code already exists", async () => {
    await createAccount({ code: "ZZ.CA002", name: "First", type: AccountType.active, category: AccountCategory.asset });
    await expect(
      createAccount({ code: "ZZ.CA002", name: "Duplicate", type: AccountType.active, category: AccountCategory.asset })
    ).rejects.toThrow("ZZ.CA002");
  });

  it("creates account with optional parentId", async () => {
    const parent = await createAccount({ code: "ZZ.CA003", name: "Parent", type: AccountType.active, category: AccountCategory.asset });
    const child  = await createAccount({ code: "ZZ.CA003-1", name: "Child", type: AccountType.active, category: AccountCategory.asset, parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
  });

  it("sets isSystem to false by default", async () => {
    const account = await createAccount({ code: "ZZ.CA004", name: "Non-system", type: AccountType.active, category: AccountCategory.asset });
    expect(account.isSystem).toBe(false);
  });
});

describe("accounting/accounts — deleteAccount", () => {
  beforeAll(async () => {
    await getTestDb().account.deleteMany({ where: { code: { startsWith: "ZZ." } } });
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("successfully deletes a plain account with no children or ledger lines", async () => {
    const account = await createAccount({ code: "ZZ.DA001", name: "Temp", type: AccountType.active, category: AccountCategory.asset });
    await expect(deleteAccount(account.id)).resolves.toBeUndefined();
  });

  it("throws when account is not found", async () => {
    await expect(deleteAccount("non-existent-id")).rejects.toThrow("Account not found");
  });

  it("throws when deleting a system account", async () => {
    const account = await mkAccount("ZZ.DA002", { isSystem: true });
    await expect(deleteAccount(account.id)).rejects.toThrow("Cannot delete system account");
  });

  it("throws when account has child accounts", async () => {
    const parent = await createAccount({ code: "ZZ.DA003", name: "Parent", type: AccountType.active, category: AccountCategory.asset });
    await createAccount({ code: "ZZ.DA003-1", name: "Child", type: AccountType.active, category: AccountCategory.asset, parentId: parent.id });
    await expect(deleteAccount(parent.id)).rejects.toThrow("Cannot delete account with children");
  });

  it("throws when account has ledger line entries", async () => {
    const account = await createAccount({ code: "ZZ.DA004", name: "Used", type: AccountType.active, category: AccountCategory.asset });
    await seedLedgerLine(account.id, 100, 0, "JE-ACC-001", new Date("2025-06-01"));
    await expect(deleteAccount(account.id)).rejects.toThrow("Cannot delete account with ledger entries");
  });

  it("allows deleting sibling account after children are deleted", async () => {
    const parent = await createAccount({ code: "ZZ.DA005", name: "Parent2", type: AccountType.active, category: AccountCategory.asset });
    const child  = await createAccount({ code: "ZZ.DA005-1", name: "Child2", type: AccountType.active, category: AccountCategory.asset, parentId: parent.id });
    await deleteAccount(child.id);
    await expect(deleteAccount(parent.id)).resolves.toBeUndefined();
  });
});

describe("accounting/accounts — getAccountBalance (by accountId)", () => {
  beforeAll(async () => {
    await getTestDb().account.deleteMany({ where: { code: { startsWith: "ZZ." } } });
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("returns zero balance for account with no ledger lines", async () => {
    const account = await createAccount({ code: "ZZ.GB001", name: "Empty", type: AccountType.active, category: AccountCategory.asset });
    const result = await getAccountBalance(account.id, new Date());
    expect(result).toEqual({ debit: 0, credit: 0, balance: 0 });
  });

  it("correctly sums debit and credit lines", async () => {
    const account = await createAccount({ code: "ZZ.GB002", name: "Active", type: AccountType.active, category: AccountCategory.asset });
    const db = getTestDb();
    const entry = await db.journalEntry.create({
      data: { number: "JE-ACC-010", date: new Date("2025-06-01"), isReversed: false },
    });
    await db.ledgerLine.createMany({
      data: [
        { entryId: entry.id, accountId: account.id, debit: 500, credit: 0 },
        { entryId: entry.id, accountId: account.id, debit: 0,   credit: 200 },
      ],
    });
    const result = await getAccountBalance(account.id, new Date("2025-12-31"));
    expect(result.debit).toBe(500);
    expect(result.credit).toBe(200);
    expect(result.balance).toBe(300);
  });

  it("excludes lines from entries after asOfDate", async () => {
    const account = await createAccount({ code: "ZZ.GB003", name: "Dated", type: AccountType.active, category: AccountCategory.asset });
    await seedLedgerLine(account.id, 300, 0, "JE-ACC-011", new Date("2025-01-15"));
    await seedLedgerLine(account.id, 700, 0, "JE-ACC-012", new Date("2025-12-31"));
    const result = await getAccountBalance(account.id, new Date("2025-06-30"));
    expect(result.debit).toBe(300);
  });

  it("excludes lines from reversed journal entries", async () => {
    const account = await createAccount({ code: "ZZ.GB004", name: "Reversed", type: AccountType.active, category: AccountCategory.asset });
    const db = getTestDb();
    const entry = await db.journalEntry.create({
      data: { number: "JE-ACC-013", date: new Date("2025-06-01"), isReversed: true },
    });
    await db.ledgerLine.create({ data: { entryId: entry.id, accountId: account.id, debit: 999, credit: 0 } });
    const result = await getAccountBalance(account.id, new Date("2025-12-31"));
    expect(result.debit).toBe(0);
    expect(result.balance).toBe(0);
  });

  it("balance = debit - credit", async () => {
    const account = await createAccount({ code: "ZZ.GB005", name: "NetBal", type: AccountType.active, category: AccountCategory.asset });
    await seedLedgerLine(account.id, 1000, 600, "JE-ACC-014", new Date("2025-03-01"));
    const result = await getAccountBalance(account.id, new Date("2025-12-31"));
    expect(result.balance).toBe(400);
  });
});

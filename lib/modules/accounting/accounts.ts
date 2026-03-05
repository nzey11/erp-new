/**
 * Account management functions
 * CRUD operations for Chart of Accounts (План счетов)
 */

import { db } from "@/lib/shared/db";
import type { Account, AccountType, AccountCategory } from "@/lib/generated/prisma/client";

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId?: string;
  analyticsType?: string;
  isSystem?: boolean;
}

export interface AccountWithBalance extends Account {
  balance: number;
  debitTurnover: number;
  creditTurnover: number;
  children?: AccountWithBalance[];
}

/**
 * Get all accounts as a flat list
 */
export async function getAccounts(includeInactive = false): Promise<Account[]> {
  return db.account.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { code: "asc" },
    include: { parent: true },
  });
}

/**
 * Get accounts as a tree structure
 */
export async function getAccountsTree(includeInactive = false): Promise<AccountWithBalance[]> {
  const accounts = await getAccounts(includeInactive);
  
  // Build tree
  const accountMap = new Map<string, AccountWithBalance>();
  const rootAccounts: AccountWithBalance[] = [];
  
  // First pass: create map
  for (const account of accounts) {
    accountMap.set(account.id, {
      ...account,
      balance: 0,
      debitTurnover: 0,
      creditTurnover: 0,
      children: [],
    });
  }
  
  // Second pass: build tree
  for (const account of accounts) {
    const node = accountMap.get(account.id)!;
    if (account.parentId) {
      const parent = accountMap.get(account.parentId);
      if (parent) {
        parent.children!.push(node);
      }
    } else {
      rootAccounts.push(node);
    }
  }
  
  return rootAccounts;
}

/**
 * Get account by code
 */
export async function getAccountByCode(code: string): Promise<Account | null> {
  return db.account.findUnique({
    where: { code },
    include: { parent: true, children: true },
  });
}

/**
 * Get account by ID
 */
export async function getAccountById(id: string): Promise<Account | null> {
  return db.account.findUnique({
    where: { id },
    include: { parent: true, children: true },
  });
}

/**
 * Create a new account
 */
export async function createAccount(data: CreateAccountInput): Promise<Account> {
  // Check if code already exists
  const existing = await db.account.findUnique({
    where: { code: data.code },
  });
  
  if (existing) {
    throw new Error(`Счет с кодом "${data.code}" уже exists`);
  }
  
  return db.account.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      category: data.category,
      parentId: data.parentId,
      analyticsType: data.analyticsType,
      isSystem: data.isSystem ?? false,
      isActive: true,
    },
  });
}

/**
 * Update an account
 */
export async function updateAccount(
  id: string,
  data: Partial<Omit<CreateAccountInput, "code">>
): Promise<Account> {
  return db.account.update({
    where: { id },
    data: { ...data },
  });
}

/**
 * Delete an account (only non-system accounts)
 */
export async function deleteAccount(id: string): Promise<void> {
  const account = await db.account.findUnique({
    where: { id },
  });
  
  if (!account) {
    throw new Error("Account not found");
  }
  
  if (account.isSystem) {
    throw new Error("Cannot delete system account");
  }
  
  // Check if account has children
  const children = await db.account.findMany({
    where: { parentId: id },
  });
  
  if (children.length > 0) {
    throw new Error("Cannot delete account with children");
  }
  
  // Check if account has ledger lines
  const lines = await db.ledgerLine.findMany({
    where: { accountId: id },
    take: 1,
  });
  
  if (lines.length > 0) {
    throw new Error("Cannot delete account with ledger entries");
  }
  
  await db.account.delete({
    where: { id },
  });
}

/**
 * Get account balance as of a specific date
 */
export async function getAccountBalance(
  accountId: string,
  asOfDate: Date
): Promise<{ debit: number; credit: number; balance: number }> {
  const lines = await db.ledgerLine.findMany({
    where: {
      accountId,
      entry: {
        date: { lte: asOfDate },
        isReversed: false,
      },
    },
    select: {
      debit: true,
      credit: true,
    },
  });
  
  const debit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const credit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  
  return { debit, credit, balance: debit - credit };
}


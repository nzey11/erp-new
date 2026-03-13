import { NextResponse } from "next/server";
import { getAuthSession, type TenantAwareSession } from "./auth";
import { logger } from "./logger";
import type { ErpRole } from "@/lib/generated/prisma/client";

export type { ErpRole };

// Re-export TenantAwareSession for consumers
export type { TenantAwareSession };

/** Role hierarchy for comparison */
const ROLE_HIERARCHY: Record<ErpRole, number> = {
  admin: 4,
  manager: 3,
  accountant: 2,
  viewer: 1,
};

/** Permission types */
export type Permission =
  | "products:read" | "products:write"
  | "categories:read" | "categories:write"
  | "units:read" | "units:write"
  | "counterparties:read" | "counterparties:write"
  | "warehouses:read" | "warehouses:write"
  | "stock:read"
  | "documents:read" | "documents:write" | "documents:confirm"
  | "pricing:read" | "pricing:write"
  | "payments:read" | "payments:write"
  | "reports:read"
  | "settings:write"
  | "users:manage"
  | "journal:manual" | "journal:manualRestrictedAccounts" | "journal:reverse"
  | "crm:merge";

/** Permissions granted to each role */
const ROLE_PERMISSIONS: Record<ErpRole, Permission[]> = {
  admin: [
    "products:read", "products:write",
    "categories:read", "categories:write",
    "units:read", "units:write",
    "counterparties:read", "counterparties:write",
    "warehouses:read", "warehouses:write",
    "stock:read",
    "documents:read", "documents:write", "documents:confirm",
    "pricing:read", "pricing:write",
    "payments:read", "payments:write",
    "reports:read",
    "settings:write", "users:manage",
    "journal:manual", "journal:manualRestrictedAccounts", "journal:reverse",
    "crm:merge",
  ],
  manager: [
    "products:read", "products:write",
    "categories:read", "categories:write",
    "units:read", "units:write",
    "counterparties:read", "counterparties:write",
    "warehouses:read", "warehouses:write",
    "stock:read",
    "documents:read", "documents:write", "documents:confirm",
    "pricing:read", "pricing:write",
    "payments:read", "payments:write",
    "reports:read",
    "crm:merge",
  ],
  accountant: [
    "products:read",
    "categories:read",
    "units:read",
    "counterparties:read",
    "warehouses:read",
    "stock:read",
    "documents:read", "documents:write", "documents:confirm",
    "pricing:read", "pricing:write",
    "payments:read", "payments:write",
    "reports:read",
    "journal:manual", "journal:manualRestrictedAccounts", "journal:reverse",
  ],
  viewer: [
    "products:read",
    "categories:read",
    "units:read",
    "counterparties:read",
    "warehouses:read",
    "stock:read",
    "documents:read",
    "pricing:read",
    "payments:read",
    "reports:read",
  ],
};

/** Role display names */
export const ROLE_LABELS: Record<ErpRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  viewer: "Наблюдатель",
};

/** Compare roles: returns true if roleA >= roleB */
export function isRoleAtLeast(roleA: ErpRole, roleB: ErpRole): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/** Check if a role has a specific permission */
export function roleHasPermission(role: ErpRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

type AuthUser = TenantAwareSession;

/** Require authenticated user. Throws on failure. */
export async function requireAuth(minRole?: ErpRole): Promise<AuthUser> {
  const user = await getAuthSession();

  if (!user) {
    throw new AuthorizationError("Unauthorized", 401);
  }

  if (minRole && !isRoleAtLeast(user.role, minRole)) {
    throw new AuthorizationError(
      `Требуется роль "${ROLE_LABELS[minRole]}" или выше`,
      403
    );
  }

  return user;
}

/** Require specific permission. Throws on failure. */
export async function requirePermission(permission: Permission): Promise<AuthUser> {
  const user = await getAuthSession();

  if (!user) {
    throw new AuthorizationError("Unauthorized", 401);
  }

  if (!roleHasPermission(user.role, permission)) {
    throw new AuthorizationError("Недостаточно прав для этого действия", 403);
  }

  return user;
}

/** Authorization error with HTTP status */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AuthorizationError";
  }

  toResponse(): NextResponse {
    return NextResponse.json({ error: this.message }, { status: this.status });
  }
}

/** Handle auth errors in API routes */
export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return error.toResponse();
  }
  logger.error("auth", "Unexpected auth error", error);
  return NextResponse.json({ error: "Ошибка авторизации" }, { status: 500 });
}

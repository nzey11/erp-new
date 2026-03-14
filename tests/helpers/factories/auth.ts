/**
 * Auth domain test factories.
 *
 * Factories for authentication and user management entities.
 */

import { db } from "@/lib/shared/db";
import { uniqueId } from "./core";

// =============================================
// Tenant Factory
// =============================================

export async function createTenant(
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  }> = {}
) {
  const id = overrides.id ?? `tenant_${uniqueId()}`;
  return db.tenant.upsert({
    where: { id },
    create: {
      id,
      name: overrides.name ?? `Tenant ${id}`,
      slug: overrides.slug ?? id,
      isActive: overrides.isActive ?? true,
    },
    update: {},
  });
}

// =============================================
// User Factory
// =============================================

export async function createUser(
  overrides: Partial<{
    username: string;
    password: string;
    email: string;
    role: "admin" | "manager" | "accountant" | "viewer";
    isActive: boolean;
    tenantId?: string;
  }> = {}
) {
  const id = uniqueId();

  // Create user
  const user = await db.user.create({
    data: {
      username: overrides.username ?? `user_${id}`,
      password: overrides.password ?? "$2a$10$test_hash",
      email: overrides.email,
      role: overrides.role ?? "admin",
      isActive: overrides.isActive ?? true,
    },
  });

  // Create tenant and membership for the user (required for login)
  const tenant = await createTenant({ id: `tenant-${user.id}` });
  await db.tenantMembership.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      role: overrides.role ?? "admin",
      isActive: true,
    },
  });

  return user;
}

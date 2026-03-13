// =============================================
// USERS LIFECYCLE: Protected User Invariants
// =============================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestRequest, jsonResponse } from "../../helpers/api-client";
import { createUser } from "../../helpers/factories";
import { hash } from "bcryptjs";
import { db } from "@/lib/shared/db";
import type { ErpRole } from "@/lib/generated/prisma/client";

// Mock auth module (required by route handlers)
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return {
    ...actual,
    getAuthSession: vi.fn(),
  };
});

// Mock audit module to verify logging calls
vi.mock("@/lib/modules/accounting/services/user-audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/accounting/services/user-audit")>();
  return {
    ...actual,
    logUserLifecycleChange: vi.fn(),
  };
});

// Import route handlers AFTER mocks
import { PUT, DELETE } from "@/app/api/accounting/users/[id]/route";
import { POST as ACTIVATE } from "@/app/api/accounting/users/[id]/activate/route";
import { POST as DEACTIVATE } from "@/app/api/accounting/users/[id]/deactivate/route";
import { POST as LOGIN } from "@/app/api/auth/login/route";

// Import mocked modules to access mock functions
import { logUserLifecycleChange } from "@/lib/modules/accounting/services/user-audit";
import * as authModule from "@/lib/shared/auth";

// Local mock helper that works with vi.mock hoisting
function mockAuthUser(user: {
  id: string;
  username: string;
  role: ErpRole;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  membershipId?: string;
}) {
  vi.mocked(authModule.getAuthSession).mockResolvedValue({
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId ?? "test-tenant",
    tenantName: user.tenantName ?? "Test Tenant",
    tenantSlug: user.tenantSlug ?? "test-tenant",
    membershipId: user.membershipId ?? "test-membership",
  });
}

function mockAuthNone() {
  vi.mocked(authModule.getAuthSession).mockResolvedValue(null);
}

// Helper to create tenant and membership for login tests
async function createTenantAndMembership(userId: string, role: ErpRole = "viewer") {
  const tenant = await db.tenant.create({
    data: {
      name: "Test Tenant",
      slug: `test-tenant-${Date.now()}`,
    },
  });

  const membership = await db.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId,
      role,
      isActive: true,
    },
  });

  return { tenant, membership };
}

describe("API: Users Lifecycle - Protected User Invariants", () => {
  let adminUser: { id: string; username: string; role: ErpRole };

  beforeEach(async () => {
    // Create admin user (protected by username)
    const passwordHash = await hash("admin123", 12);
    adminUser = await createUser({
      username: "admin",
      password: passwordHash,
      role: "admin",
      isActive: true,
    });
  });

  // ==========================================
  // Protected User Deactivation Prevention
  // ==========================================

  describe("POST /api/accounting/users/:id/deactivate", () => {
    it("should reject deactivation of protected user 'admin'", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}/deactivate`, {
        method: "POST",
      });

      const res = await DEACTIVATE(req, { params: Promise.resolve({ id: adminUser.id }) });
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toContain("Cannot deactivate protected system user");
      expect(data.error).toContain("admin");
    });

    it("should reject deactivation of protected user 'test'", async () => {
      const passwordHash = await hash("test123", 12);
      const testUser = await createUser({
        username: "test",
        password: passwordHash,
        role: "manager",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${testUser.id}/deactivate`, {
        method: "POST",
      });

      const res = await DEACTIVATE(req, { params: Promise.resolve({ id: testUser.id }) });
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toContain("Cannot deactivate protected system user");
    });

    it("should reject deactivation of protected user 'developer'", async () => {
      const passwordHash = await hash("dev123", 12);
      const devUser = await createUser({
        username: "developer",
        password: passwordHash,
        role: "manager",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${devUser.id}/deactivate`, {
        method: "POST",
      });

      const res = await DEACTIVATE(req, { params: Promise.resolve({ id: devUser.id }) });
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toContain("Cannot deactivate protected system user");
    });

    it("should allow deactivation of regular (non-protected) user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${regularUser.id}/deactivate`, {
        method: "POST",
      });

      const res = await DEACTIVATE(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.isActive).toBe(false);
    });
  });

  describe("POST /api/accounting/users/:id/activate", () => {
    it("should allow activation of any user (including protected)", async () => {
      // First deactivate admin via direct DB (bypassing API protection)
      await db.user.update({
        where: { id: adminUser.id },
        data: { isActive: false },
      });

      mockAuthUser(adminUser);

      // Now try to reactivate via API
      const req = createTestRequest(`/api/accounting/users/${adminUser.id}/activate`, {
        method: "POST",
      });

      const res = await ACTIVATE(req, { params: Promise.resolve({ id: adminUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.isActive).toBe(true);
    });

    it("should allow activation of regular user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: false,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${regularUser.id}/activate`, {
        method: "POST",
      });

      const res = await ACTIVATE(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.isActive).toBe(true);
    });
  });

  // ==========================================
  // Protected User Delete Prevention
  // ==========================================

  describe("DELETE /api/accounting/users/:id", () => {
    it("should reject soft delete of protected user 'admin'", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: adminUser.id }) });
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toContain("Cannot delete protected system user");
    });

    it("should reject soft delete of protected user 'test'", async () => {
      const passwordHash = await hash("test123", 12);
      const testUser = await createUser({
        username: "test",
        password: passwordHash,
        role: "manager",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${testUser.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: testUser.id }) });
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toContain("Cannot delete protected system user");
    });

    it("should allow soft delete of regular (non-protected) user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${regularUser.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.success).toBe(true);

      // Verify user is deactivated (soft delete)
      const updatedUser = await db.user.findUnique({
        where: { id: regularUser.id },
        select: { isActive: true },
      });
      expect(updatedUser?.isActive).toBe(false);
    });
  });

  // ==========================================
  // Auth Behavior After Deactivation
  // ==========================================

  describe("Auth behavior after deactivation", () => {
    it("should reject login for deactivated regular user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: true,
      });

      // Deactivate user via lifecycle endpoint
      mockAuthUser(adminUser);
      const deactivateReq = createTestRequest(`/api/accounting/users/${regularUser.id}/deactivate`, {
        method: "POST",
      });
      await DEACTIVATE(deactivateReq, { params: Promise.resolve({ id: regularUser.id }) });

      // Try to login
      const loginReq = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "regularuser",
          password: "regular123",
        },
      });

      const res = await LOGIN(loginReq);
      expect(res.status).toBe(401);
    });

    it("should allow login after reactivation", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: false, // Start inactive
      });

      // Create tenant and membership for the user
      await createTenantAndMembership(regularUser.id, "viewer");

      // Reactivate user via lifecycle endpoint
      mockAuthUser(adminUser);
      const activateReq = createTestRequest(`/api/accounting/users/${regularUser.id}/activate`, {
        method: "POST",
      });
      await ACTIVATE(activateReq, { params: Promise.resolve({ id: regularUser.id }) });

      // Try to login
      const loginReq = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "regularuser",
          password: "regular123",
        },
      });

      const res = await LOGIN(loginReq);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.user.username).toBe("regularuser");
      expect(data.user.tenantId).toBeDefined();
    });
  });

  // ==========================================
  // Regular Profile Update Still Works
  // ==========================================

  describe("Regular profile updates", () => {
    it("should allow updating username for protected user", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}`, {
        method: "PUT",
        body: { email: "admin@company.com" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: adminUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.email).toBe("admin@company.com");
    });

    it("should allow changing role for protected user", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}`, {
        method: "PUT",
        body: { role: "manager" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: adminUser.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.role).toBe("manager");
    });
  });

  // ==========================================
  // Audit Logging Verification
  // ==========================================

  describe("Audit logging", () => {
    beforeEach(() => {
      (logUserLifecycleChange as ReturnType<typeof vi.fn>).mockClear();
    });

    it("should log deactivate success for regular user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: true,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${regularUser.id}/deactivate`, {
        method: "POST",
      });

      await DEACTIVATE(req, { params: Promise.resolve({ id: regularUser.id }) });

      expect(logUserLifecycleChange).toHaveBeenCalledTimes(1);
      const callArg = (logUserLifecycleChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.action).toBe("deactivate");
      expect(callArg.result).toBe("success");
      expect(callArg.actorUserId).toBe(adminUser.id);
      expect(callArg.targetUserId).toBe(regularUser.id);
    });

    it("should log deactivate forbidden for protected user", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}/deactivate`, {
        method: "POST",
      });

      await DEACTIVATE(req, { params: Promise.resolve({ id: adminUser.id }) });

      expect(logUserLifecycleChange).toHaveBeenCalledTimes(1);
      const callArg = (logUserLifecycleChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.action).toBe("deactivate");
      expect(callArg.result).toBe("forbidden");
      expect(callArg.actorUserId).toBe(adminUser.id);
      expect(callArg.targetUserId).toBe(adminUser.id);
    });

    it("should log soft_delete forbidden for protected user", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${adminUser.id}`, {
        method: "DELETE",
      });

      await DELETE(req, { params: Promise.resolve({ id: adminUser.id }) });

      expect(logUserLifecycleChange).toHaveBeenCalledTimes(1);
      const callArg = (logUserLifecycleChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.action).toBe("soft_delete");
      expect(callArg.result).toBe("forbidden");
      expect(callArg.actorUserId).toBe(adminUser.id);
      expect(callArg.targetUserId).toBe(adminUser.id);
    });

    it("should log activate success for any user", async () => {
      const passwordHash = await hash("regular123", 12);
      const regularUser = await createUser({
        username: "regularuser",
        password: passwordHash,
        role: "viewer",
        isActive: false,
      });
      mockAuthUser(adminUser);

      const req = createTestRequest(`/api/accounting/users/${regularUser.id}/activate`, {
        method: "POST",
      });

      await ACTIVATE(req, { params: Promise.resolve({ id: regularUser.id }) });

      expect(logUserLifecycleChange).toHaveBeenCalledTimes(1);
      const callArg = (logUserLifecycleChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.action).toBe("activate");
      expect(callArg.result).toBe("success");
      expect(callArg.actorUserId).toBe(adminUser.id);
      expect(callArg.targetUserId).toBe(regularUser.id);
    });
  });
});

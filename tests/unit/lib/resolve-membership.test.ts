/**
 * Unit tests: Tenant Membership Resolution
 *
 * Tests the membership resolution logic for tenant-aware authentication.
 * Uses mocked database to verify error handling and selection logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database before importing the service
const mockTenantMembership = {
  findMany: vi.fn(),
};

vi.mock("@/lib/shared/db", () => ({
  db: {
    tenantMembership: mockTenantMembership,
  },
}));

// Import after mock is set up
const {
  resolveActiveMembershipForUser,
  getActiveMembershipsForUser,
  MembershipResolutionError,
} = await import("@/lib/modules/auth/resolve-membership");

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const createMockMembership = (overrides: {
  id: string;
  tenantId: string;
  role: "admin" | "manager" | "accountant" | "viewer";
  isActive?: boolean;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    isActive?: boolean;
  };
  createdAt?: Date;
}) => ({
  id: overrides.id,
  tenantId: overrides.tenantId,
  userId: "user-1",
  role: overrides.role,
  isActive: overrides.isActive ?? true,
  createdAt: overrides.createdAt ?? new Date("2024-01-01"),
  tenant: {
    id: overrides.tenant?.id ?? overrides.tenantId,
    name: overrides.tenant?.name ?? "Test Tenant",
    slug: overrides.tenant?.slug ?? "test-tenant",
    isActive: overrides.tenant?.isActive ?? true,
  },
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("resolveActiveMembershipForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success cases", () => {
    it("should return resolved membership for user with single active membership", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([
        createMockMembership({
          id: "membership-1",
          tenantId: "tenant-1",
          role: "admin",
          tenant: {
            id: "tenant-1",
            name: "Acme Corp",
            slug: "acme-corp",
          },
        }),
      ]);

      const result = await resolveActiveMembershipForUser("user-1");

      expect(result).toEqual({
        membershipId: "membership-1",
        tenantId: "tenant-1",
        role: "admin",
        tenantName: "Acme Corp",
        tenantSlug: "acme-corp",
      });
    });

    it("should auto-select first membership when multiple exist (v1 behavior)", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([
        createMockMembership({
          id: "membership-1",
          tenantId: "tenant-1",
          role: "viewer",
          createdAt: new Date("2024-01-01"),
        }),
        createMockMembership({
          id: "membership-2",
          tenantId: "tenant-2",
          role: "admin",
          createdAt: new Date("2024-06-01"),
        }),
      ]);

      const result = await resolveActiveMembershipForUser("user-1");

      // Should select the first one (by createdAt)
      expect(result.membershipId).toBe("membership-1");
    });
  });

  describe("error cases", () => {
    it("should throw NO_MEMBERSHIP when user has no memberships", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([]);

      try {
        await resolveActiveMembershipForUser("user-1");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MembershipResolutionError);
        expect((error as InstanceType<typeof MembershipResolutionError>).code).toBe("NO_MEMBERSHIP");
        expect((error as Error).message).toContain("нет доступа");
      }
    });

    it("should throw MEMBERSHIP_INACTIVE when membership is inactive", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([
        createMockMembership({
          id: "membership-1",
          tenantId: "tenant-1",
          role: "viewer",
          isActive: false,
        }),
      ]);

      try {
        await resolveActiveMembershipForUser("user-1");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MembershipResolutionError);
        expect((error as InstanceType<typeof MembershipResolutionError>).code).toBe(
          "MEMBERSHIP_INACTIVE"
        );
        expect((error as Error).message).toContain("приостановлен");
      }
    });

    it("should throw TENANT_INACTIVE when tenant is inactive", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([
        createMockMembership({
          id: "membership-1",
          tenantId: "tenant-1",
          role: "viewer",
          isActive: true,
          tenant: {
            id: "tenant-1",
            name: "Inactive Corp",
            slug: "inactive-corp",
            isActive: false,
          },
        }),
      ]);

      try {
        await resolveActiveMembershipForUser("user-1");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MembershipResolutionError);
        expect((error as InstanceType<typeof MembershipResolutionError>).code).toBe("TENANT_INACTIVE");
        expect((error as Error).message).toContain("деактивирована");
      }
    });

    it("should prefer MEMBERSHIP_INACTIVE over TENANT_INACTIVE when both are inactive", async () => {
      mockTenantMembership.findMany.mockResolvedValueOnce([
        createMockMembership({
          id: "membership-1",
          tenantId: "tenant-1",
          role: "viewer",
          isActive: false,
          tenant: {
            id: "tenant-1",
            name: "Inactive Corp",
            slug: "inactive-corp",
            isActive: false,
          },
        }),
      ]);

      try {
        await resolveActiveMembershipForUser("user-1");
      } catch (error) {
        // Membership inactive takes precedence
        expect((error as InstanceType<typeof MembershipResolutionError>).code).toBe(
          "MEMBERSHIP_INACTIVE"
        );
      }
    });
  });
});

describe("getActiveMembershipsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all active memberships for user", async () => {
    mockTenantMembership.findMany.mockResolvedValueOnce([
      createMockMembership({
        id: "membership-1",
        tenantId: "tenant-1",
        role: "viewer",
      }),
      createMockMembership({
        id: "membership-2",
        tenantId: "tenant-2",
        role: "admin",
        tenant: {
          id: "tenant-2",
          name: "Second Corp",
          slug: "second-corp",
        },
      }),
    ]);

    const result = await getActiveMembershipsForUser("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].membershipId).toBe("membership-1");
    expect(result[1].membershipId).toBe("membership-2");
  });

  it("should return empty array when no active memberships", async () => {
    mockTenantMembership.findMany.mockResolvedValueOnce([]);

    const result = await getActiveMembershipsForUser("user-1");

    expect(result).toHaveLength(0);
  });
});

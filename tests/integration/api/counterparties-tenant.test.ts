import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser, createCounterparty } from "../../helpers/factories";
import { getTestDb } from "../../helpers/test-db";

// Mock the auth module so we can control session
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return {
    ...actual,
    getAuthSession: vi.fn(),
  };
});

// Import route handlers
import { GET, POST } from "@/app/api/accounting/counterparties/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/accounting/counterparties/[id]/route";

describe("API: Counterparties Tenant Isolation", () => {
  let tenantAUser: Awaited<ReturnType<typeof createUser>>;
  let tenantBUser: Awaited<ReturnType<typeof createUser>>;

  // Helper to get correct tenantId for a user
  const getTenantId = (userId: string) => `tenant-${userId}`;

  beforeEach(async () => {
    // Create two separate users (each gets their own tenant via createUser)
    tenantAUser = await createUser({ role: "admin" });
    tenantBUser = await createUser({ role: "admin" });

    // Default: no auth
    mockAuthNone();
  });

  // ==========================================
  // Test 1: Counterparty list returns only same-tenant counterparties
  // ==========================================

  describe("GET /api/accounting/counterparties - tenant isolation", () => {
    it("should return only counterparties from the authenticated tenant", async () => {
      // Create counterparties for tenantA
      const counterpartyA1 = await createCounterparty({ 
        name: "TenantA Counterparty 1", 
        tenantId: getTenantId(tenantAUser.id) 
      });
      const counterpartyA2 = await createCounterparty({ 
        name: "TenantA Counterparty 2", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Create counterparty for tenantB
      const counterpartyB = await createCounterparty({ 
        name: "TenantB Counterparty", 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest("/api/accounting/counterparties", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 2 counterparties (tenantA's counterparties)
      expect(data.data).toHaveLength(2);
      expect(data.total).toBe(2);

      // Verify tenantA counterparties are returned
      const returnedIds = data.data.map((c: { id: string }) => c.id);
      expect(returnedIds).toContain(counterpartyA1.id);
      expect(returnedIds).toContain(counterpartyA2.id);

      // Verify tenantB counterparty is NOT returned
      expect(returnedIds).not.toContain(counterpartyB.id);
    });

    it("should return only counterparties from tenantB when authenticated as tenantB", async () => {
      // Create counterparty for tenantA
      await createCounterparty({ 
        name: "TenantA Counterparty", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Create counterparty for tenantB
      const counterpartyB = await createCounterparty({ 
        name: "TenantB Counterparty", 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest("/api/accounting/counterparties", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 1 counterparty (tenantB's counterparty)
      expect(data.data).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.data[0].id).toBe(counterpartyB.id);
    });
  });

  // ==========================================
  // Test 2: Counterparty GET by id denies cross-tenant access
  // ==========================================

  describe("GET /api/accounting/counterparties/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to access tenantA's counterparty", async () => {
      // Create counterparty for tenantA
      const counterpartyA = await createCounterparty({ 
        name: "TenantA Counterparty", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      // Should return 404 (not 403) to prevent information leakage
      expect(res.status).toBe(404);

      const data = await jsonResponse(res);
      expect(data.error).toBeDefined();
    });

    it("should return 404 when tenantA tries to access tenantB's counterparty", async () => {
      // Create counterparty for tenantB
      const counterpartyB = await createCounterparty({ 
        name: "TenantB Counterparty", 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyB.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: counterpartyB.id }) });
      
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Test 3: Counterparty update denies cross-tenant modification
  // ==========================================

  describe("PUT /api/accounting/counterparties/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to update tenantA's counterparty", async () => {
      // Create counterparty for tenantA
      const counterpartyA = await createCounterparty({ 
        name: "TenantA Counterparty", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`, {
        method: "PUT",
        body: { name: "Hacked Name" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify counterparty was NOT modified
      const db = getTestDb();
      const unchanged = await db.counterparty.findUnique({ where: { id: counterpartyA.id } });
      expect(unchanged?.name).toBe("TenantA Counterparty");
    });
  });

  // ==========================================
  // Test 4: Counterparty delete denies cross-tenant deletion
  // ==========================================

  describe("DELETE /api/accounting/counterparties/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to delete tenantA's counterparty", async () => {
      // Create counterparty for tenantA
      const counterpartyA = await createCounterparty({ 
        name: "TenantA Counterparty", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify counterparty was NOT deleted (still active)
      const db = getTestDb();
      const stillExists = await db.counterparty.findUnique({ where: { id: counterpartyA.id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.isActive).toBe(true);
    });
  });

  // ==========================================
  // Test 5: Same-tenant operations still work
  // ==========================================

  describe("Same-tenant counterparty operations succeed", () => {
    it("should allow tenantA to GET their own counterparty", async () => {
      const counterpartyA = await createCounterparty({ 
        name: "TenantA Counterparty", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.id).toBe(counterpartyA.id);
      expect(data.name).toBe("TenantA Counterparty");
    });

    it("should allow tenantA to UPDATE their own counterparty", async () => {
      const counterpartyA = await createCounterparty({ 
        name: "Original Name", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`, {
        method: "PUT",
        body: { name: "Updated Name" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.name).toBe("Updated Name");
    });

    it("should allow tenantA to DELETE their own counterparty (soft delete)", async () => {
      const counterpartyA = await createCounterparty({ 
        name: "To Delete", 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/counterparties/${counterpartyA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: counterpartyA.id }) });
      
      expect(res.status).toBe(200);

      // Verify soft delete (isActive = false, not actually deleted)
      const db = getTestDb();
      const deleted = await db.counterparty.findUnique({ where: { id: counterpartyA.id } });
      expect(deleted?.isActive).toBe(false);
    });
  });
});

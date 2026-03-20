import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser, createUnit, createProduct } from "../../helpers/factories";
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
import { GET } from "@/app/api/accounting/products/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/accounting/products/[id]/route";

describe("API: Products Tenant Isolation", () => {
  let tenantAUser: Awaited<ReturnType<typeof createUser>>;
  let tenantBUser: Awaited<ReturnType<typeof createUser>>;
  let unit: Awaited<ReturnType<typeof createUnit>>;

  // Helper to get correct tenantId for a user
  const getTenantId = (userId: string) => `tenant-${userId}`;

  beforeEach(async () => {
    // Create two separate users (each gets their own tenant via createUser)
    tenantAUser = await createUser({ role: "admin" });
    tenantBUser = await createUser({ role: "admin" });
    unit = await createUnit({ shortName: "шт" });
    // Default: no auth
    mockAuthNone();
  });

  // ==========================================
  // Test 1: Product list returns only same-tenant products
  // ==========================================

  describe("GET /api/accounting/products - tenant isolation", () => {
    it("should return only products from the authenticated tenant", async () => {
      // Create products for tenantA
      const productA1 = await createProduct({ 
        name: "TenantA Product 1", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });
      const productA2 = await createProduct({ 
        name: "TenantA Product 2", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Create product for tenantB
      const productB = await createProduct({ 
        name: "TenantB Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest("/api/accounting/products", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 2 products (tenantA's products)
      expect(data.data).toHaveLength(2);
      expect(data.total).toBe(2);

      // Verify tenantA products are returned
      const returnedIds = data.data.map((p: { id: string }) => p.id);
      expect(returnedIds).toContain(productA1.id);
      expect(returnedIds).toContain(productA2.id);

      // Verify tenantB product is NOT returned
      expect(returnedIds).not.toContain(productB.id);
    });

    it("should return only products from tenantB when authenticated as tenantB", async () => {
      // Create products for tenantA
      await createProduct({ 
        name: "TenantA Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Create product for tenantB
      const productB = await createProduct({ 
        name: "TenantB Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest("/api/accounting/products", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 1 product (tenantB's product)
      expect(data.data).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.data[0].id).toBe(productB.id);
    });
  });

  // ==========================================
  // Test 2: Product GET by id denies cross-tenant access
  // ==========================================

  describe("GET /api/accounting/products/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to access tenantA's product", async () => {
      // Create product for tenantA
      const productA = await createProduct({ 
        name: "TenantA Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: productA.id }) });
      
      // Should return 404 (not 403) to prevent information leakage
      expect(res.status).toBe(404);

      const data = await jsonResponse(res);
      expect(data.error).toBeDefined();
    });

    it("should return 404 when tenantA tries to access tenantB's product", async () => {
      // Create product for tenantB
      const productB = await createProduct({ 
        name: "TenantB Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantBUser.id) 
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productB.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: productB.id }) });
      
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Test 3: Product update denies cross-tenant modification
  // ==========================================

  describe("PUT /api/accounting/products/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to update tenantA's product", async () => {
      // Create product for tenantA
      const productA = await createProduct({ 
        name: "TenantA Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`, {
        method: "PUT",
        body: { name: "Hacked Name" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: productA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify product was NOT modified
      const db = getTestDb();
      const unchanged = await db.product.findUnique({ where: { id: productA.id } });
      expect(unchanged?.name).toBe("TenantA Product");
    });
  });

  // ==========================================
  // Test 4: Product delete denies cross-tenant deletion
  // ==========================================

  describe("DELETE /api/accounting/products/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to delete tenantA's product", async () => {
      // Create product for tenantA
      const productA = await createProduct({ 
        name: "TenantA Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: productA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify product was NOT deleted (still active)
      const db = getTestDb();
      const stillExists = await db.product.findUnique({ where: { id: productA.id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.isActive).toBe(true);
    });
  });

  // ==========================================
  // Test 5: Same-tenant access still works
  // ==========================================

  describe("Same-tenant operations succeed", () => {
    it("should allow tenantA to GET their own product", async () => {
      const productA = await createProduct({ 
        name: "TenantA Product", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: productA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.id).toBe(productA.id);
      expect(data.name).toBe("TenantA Product");
    });

    it("should allow tenantA to UPDATE their own product", async () => {
      const productA = await createProduct({ 
        name: "Original Name", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`, {
        method: "PUT",
        body: { name: "Updated Name" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: productA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.name).toBe("Updated Name");
    });

    it("should allow tenantA to DELETE their own product", async () => {
      const productA = await createProduct({ 
        name: "To Delete", 
        unitId: unit.id, 
        tenantId: getTenantId(tenantAUser.id) 
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/products/${productA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: productA.id }) });
      
      expect(res.status).toBe(200);

      // Verify soft delete
      const db = getTestDb();
      const deleted = await db.product.findUnique({ where: { id: productA.id } });
      expect(deleted?.isActive).toBe(false);
    });
  });
});

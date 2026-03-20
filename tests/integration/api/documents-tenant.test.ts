import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser, createWarehouse, createProduct, createDocument, createDocumentItem } from "../../helpers/factories";
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
import { GET } from "@/app/api/accounting/documents/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/accounting/documents/[id]/route";
import { POST as CONFIRM } from "@/app/api/accounting/documents/[id]/confirm/route";
import { POST as CANCEL } from "@/app/api/accounting/documents/[id]/cancel/route";

describe("API: Documents Tenant Isolation", () => {
  let tenantAUser: Awaited<ReturnType<typeof createUser>>;
  let tenantBUser: Awaited<ReturnType<typeof createUser>>;
  let tenantAWarehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let tenantBWarehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let tenantAProduct: Awaited<ReturnType<typeof createProduct>>;

  // Helper to get correct tenantId for a user
  const getTenantId = (userId: string) => `tenant-${userId}`;

  beforeEach(async () => {
    // Create two separate users (each gets their own tenant via createUser)
    tenantAUser = await createUser({ role: "admin" });
    tenantBUser = await createUser({ role: "admin" });

    // Create warehouses for each tenant (explicit tenantId alignment)
    tenantAWarehouse = await createWarehouse({ 
      name: "TenantA Warehouse", 
      tenantId: getTenantId(tenantAUser.id) 
    });
    tenantBWarehouse = await createWarehouse({ 
      name: "TenantB Warehouse", 
      tenantId: getTenantId(tenantBUser.id) 
    });

    // Create products for each tenant (explicit tenantId alignment)
    tenantAProduct = await createProduct({ 
      name: "TenantA Product", 
      tenantId: getTenantId(tenantAUser.id) 
    });
    // Create product for tenantB (needed for test data isolation)
    await createProduct({ 
      name: "TenantB Product", 
      tenantId: getTenantId(tenantBUser.id) 
    });

    // Default: no auth
    mockAuthNone();
  });

  // ==========================================
  // Test 1: Document list returns only same-tenant documents
  // ==========================================

  describe("GET /api/accounting/documents - tenant isolation", () => {
    it("should return only documents from the authenticated tenant", async () => {
      // Create documents for tenantA (using tenantA's warehouse)
      const docA1 = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        tenantId: getTenantId(tenantAUser.id)
      });
      const docA2 = await createDocument({ 
        type: "write_off", 
        warehouseId: tenantAWarehouse.id,
        tenantId: getTenantId(tenantAUser.id)
      });

      // Create document for tenantB (using tenantB's warehouse)
      const docB = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantBWarehouse.id,
        tenantId: getTenantId(tenantBUser.id)
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest("/api/accounting/documents", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 2 documents (tenantA's documents)
      expect(data.data).toHaveLength(2);
      expect(data.total).toBe(2);

      // Verify tenantA documents are returned
      const returnedIds = data.data.map((d: { id: string }) => d.id);
      expect(returnedIds).toContain(docA1.id);
      expect(returnedIds).toContain(docA2.id);

      // Verify tenantB document is NOT returned
      expect(returnedIds).not.toContain(docB.id);
    });

    it("should return only documents from tenantB when authenticated as tenantB", async () => {
      // Create document for tenantA
      await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        tenantId: getTenantId(tenantAUser.id)
      });

      // Create document for tenantB
      const docB = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantBWarehouse.id,
        tenantId: getTenantId(tenantBUser.id)
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest("/api/accounting/documents", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      
      // Should have exactly 1 document (tenantB's document)
      expect(data.data).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.data[0].id).toBe(docB.id);
    });
  });

  // ==========================================
  // Test 2: Document GET by id denies cross-tenant access
  // ==========================================

  describe("GET /api/accounting/documents/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to access tenantA's document", async () => {
      // Create document for tenantA
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        tenantId: getTenantId(tenantAUser.id)
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: docA.id }) });
      
      // Should return 404 (not 403) to prevent information leakage
      expect(res.status).toBe(404);

      const data = await jsonResponse(res);
      expect(data.error).toBeDefined();
    });

    it("should return 404 when tenantA tries to access tenantB's document", async () => {
      // Create document for tenantB
      const docB = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantBWarehouse.id,
        tenantId: getTenantId(tenantBUser.id)
      });

      // Authenticate as tenantA
      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docB.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: docB.id }) });
      
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Test 3: Document update denies cross-tenant modification
  // ==========================================

  describe("PUT /api/accounting/documents/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to update tenantA's document", async () => {
      // Create draft document for tenantA
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`, {
        method: "PUT",
        body: { description: "Hacked Description" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: docA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify document was NOT modified
      const db = getTestDb();
      const unchanged = await db.document.findUnique({ where: { id: docA.id } });
      expect(unchanged?.description).toBeNull();
    });
  });

  // ==========================================
  // Test 4: Document delete denies cross-tenant deletion
  // ==========================================

  describe("DELETE /api/accounting/documents/[id] - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to delete tenantA's document", async () => {
      // Create draft document for tenantA
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: docA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify document was NOT deleted (still exists)
      const db = getTestDb();
      const stillExists = await db.document.findUnique({ where: { id: docA.id } });
      expect(stillExists).not.toBeNull();
    });
  });

  // ==========================================
  // Test 5: Document confirm denies cross-tenant action
  // ==========================================

  describe("POST /api/accounting/documents/[id]/confirm - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to confirm tenantA's document", async () => {
      // Create confirmable document for tenantA (draft with items)
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });
      await createDocumentItem(docA.id, tenantAProduct.id, { quantity: 10, price: 100 });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}/confirm`, {
        method: "POST",
      });

      const res = await CONFIRM(req, { params: Promise.resolve({ id: docA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify document was NOT confirmed
      const db = getTestDb();
      const unchanged = await db.document.findUnique({ where: { id: docA.id } });
      expect(unchanged?.status).toBe("draft");
      expect(unchanged?.confirmedAt).toBeNull();
    });
  });

  // ==========================================
  // Test 6: Document cancel denies cross-tenant action
  // ==========================================

  describe("POST /api/accounting/documents/[id]/cancel - cross-tenant denial", () => {
    it("should return 404 when tenantB tries to cancel tenantA's document", async () => {
      // Create cancellable document for tenantA (confirmed with items)
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "confirmed",
        confirmedAt: new Date(),
        tenantId: getTenantId(tenantAUser.id)
      });
      await createDocumentItem(docA.id, tenantAProduct.id, { quantity: 10, price: 100 });

      // Authenticate as tenantB
      mockAuthUser({ ...tenantBUser, tenantId: getTenantId(tenantBUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}/cancel`, {
        method: "POST",
      });

      const res = await CANCEL(req, { params: Promise.resolve({ id: docA.id }) });
      
      // Should return 404
      expect(res.status).toBe(404);

      // Verify document was NOT cancelled
      const db = getTestDb();
      const unchanged = await db.document.findUnique({ where: { id: docA.id } });
      expect(unchanged?.status).toBe("confirmed");
      expect(unchanged?.cancelledAt).toBeNull();
    });
  });

  // ==========================================
  // Test 7: Same-tenant operations still work
  // ==========================================

  describe("Same-tenant document operations succeed", () => {
    it("should allow tenantA to GET their own document", async () => {
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        tenantId: getTenantId(tenantAUser.id)
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`);

      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: docA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.id).toBe(docA.id);
    });

    it("should allow tenantA to UPDATE their own draft document", async () => {
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`, {
        method: "PUT",
        body: { description: "Updated Description" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: docA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.description).toBe("Updated Description");
    });

    it("should allow tenantA to DELETE their own draft document", async () => {
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: docA.id }) });
      
      expect(res.status).toBe(200);

      // Verify document was deleted
      const db = getTestDb();
      const deleted = await db.document.findUnique({ where: { id: docA.id } });
      expect(deleted).toBeNull();
    });

    it("should allow tenantA to CONFIRM their own confirmable document", async () => {
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "draft",
        tenantId: getTenantId(tenantAUser.id)
      });
      await createDocumentItem(docA.id, tenantAProduct.id, { quantity: 10, price: 100 });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}/confirm`, {
        method: "POST",
      });

      const res = await CONFIRM(req, { params: Promise.resolve({ id: docA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.status).toBe("confirmed");
      expect(data.confirmedAt).toBeDefined();
    });

    it("should allow tenantA to CANCEL their own cancellable document", async () => {
      const docA = await createDocument({ 
        type: "stock_receipt", 
        warehouseId: tenantAWarehouse.id,
        status: "confirmed",
        confirmedAt: new Date(),
        tenantId: getTenantId(tenantAUser.id)
      });
      await createDocumentItem(docA.id, tenantAProduct.id, { quantity: 10, price: 100 });

      mockAuthUser({ ...tenantAUser, tenantId: getTenantId(tenantAUser.id) });

      const req = createTestRequest(`/api/accounting/documents/${docA.id}/cancel`, {
        method: "POST",
      });

      const res = await CANCEL(req, { params: Promise.resolve({ id: docA.id }) });
      
      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.status).toBe("cancelled");
      expect(data.cancelledAt).toBeDefined();
    });
  });
});

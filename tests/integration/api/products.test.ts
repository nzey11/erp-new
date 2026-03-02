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
import { GET, POST } from "@/app/api/accounting/products/route";
import { PUT, DELETE } from "@/app/api/accounting/products/[id]/route";

describe("API: Products CRUD", () => {
  let adminUser: Awaited<ReturnType<typeof createUser>>;
  let viewerUser: Awaited<ReturnType<typeof createUser>>;
  let unit: Awaited<ReturnType<typeof createUnit>>;

  beforeEach(async () => {
    adminUser = await createUser({ role: "admin" });
    viewerUser = await createUser({ role: "viewer" });
    unit = await createUnit({ shortName: "шт" });
    // Default: no auth
    mockAuthNone();
  });

  // ==========================================
  // POST /api/accounting/products
  // ==========================================

  describe("POST /api/accounting/products", () => {
    it("should create a product with valid data", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: {
          name: "Тестовый товар",
          unitId: unit.id,
          description: "Описание",
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await jsonResponse(res);
      expect(data.name).toBe("Тестовый товар");
      expect(data.unit.shortName).toBe("шт");
    });

    it("should auto-generate SKU when autoSku is true", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: {
          name: "Auto SKU Product",
          unitId: unit.id,
          autoSku: true,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await jsonResponse(res);
      expect(data.sku).toMatch(/^SKU-\d{6}$/);
    });

    it("should reject without authentication", async () => {
      mockAuthNone();

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: { name: "Test", unitId: unit.id },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should reject with missing required fields", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: { name: "Test" }, // missing unitId
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.fields).toBeDefined();
    });

    it("should reject when viewer tries to create", async () => {
      mockAuthUser(viewerUser);

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: { name: "Test", unitId: unit.id },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("should create product with sale and purchase prices", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/products", {
        method: "POST",
        body: {
          name: "Priced Product",
          unitId: unit.id,
          purchasePrice: 100,
          salePrice: 150,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await jsonResponse(res);
      expect(data.purchasePrice).toBe(100);
      expect(data.salePrice).toBe(150);
    });
  });

  // ==========================================
  // GET /api/accounting/products
  // ==========================================

  describe("GET /api/accounting/products", () => {
    it("should return paginated products", async () => {
      mockAuthUser(adminUser);
      await createProduct({ name: "Product A", unitId: unit.id });
      await createProduct({ name: "Product B", unitId: unit.id });

      const req = createTestRequest("/api/accounting/products", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    it("should filter by search term", async () => {
      mockAuthUser(adminUser);
      await createProduct({ name: "Apple iPhone", unitId: unit.id });
      await createProduct({ name: "Samsung Galaxy", unitId: unit.id });

      const req = createTestRequest("/api/accounting/products", {
        query: { search: "Apple" },
      });

      const res = await GET(req);
      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe("Apple iPhone");
    });
  });

  // ==========================================
  // PUT /api/accounting/products/[id]
  // ==========================================

  describe("PUT /api/accounting/products/[id]", () => {
    it("should update product name", async () => {
      mockAuthUser(adminUser);
      const product = await createProduct({ name: "Old Name", unitId: unit.id });

      const req = createTestRequest(`/api/accounting/products/${product.id}`, {
        method: "PUT",
        body: { name: "New Name" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: product.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.name).toBe("New Name");
    });
  });

  // ==========================================
  // DELETE /api/accounting/products/[id]
  // ==========================================

  describe("DELETE /api/accounting/products/[id]", () => {
    it("should soft-delete product", async () => {
      mockAuthUser(adminUser);
      const product = await createProduct({ name: "To Delete", unitId: unit.id });

      const req = createTestRequest(`/api/accounting/products/${product.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: product.id }) });
      expect(res.status).toBe(200);

      // Verify soft delete
      const db = getTestDb();
      const deleted = await db.product.findUnique({ where: { id: product.id } });
      expect(deleted?.isActive).toBe(false);
    });
  });
});

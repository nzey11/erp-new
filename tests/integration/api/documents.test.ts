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
import { GET, POST } from "@/app/api/accounting/documents/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/accounting/documents/[id]/route";
import { POST as CONFIRM } from "@/app/api/accounting/documents/[id]/confirm/route";
import { POST as CANCEL } from "@/app/api/accounting/documents/[id]/cancel/route";

describe("API: Documents CRUD", () => {
  let adminUser: Awaited<ReturnType<typeof createUser>>;
  let viewerUser: Awaited<ReturnType<typeof createUser>>;
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    adminUser = await createUser({ role: "admin" });
    viewerUser = await createUser({ role: "viewer" });
    warehouse = await createWarehouse({ name: "Основной склад" });
    product = await createProduct({ name: "Товар A" });
    mockAuthNone();
  });

  // ==========================================
  // POST /api/accounting/documents
  // ==========================================

  describe("POST /api/accounting/documents", () => {
    it("should create a draft document with items", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/documents", {
        method: "POST",
        body: {
          type: "stock_receipt",
          warehouseId: warehouse.id,
          items: [
            { productId: product.id, quantity: 10, price: 100 },
          ],
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await jsonResponse(res);
      expect(data.type).toBe("stock_receipt");
      expect(data.status).toBe("draft");
      expect(data.items).toHaveLength(1);
      expect(data.totalAmount).toBe(1000);
      expect(data.number).toBeDefined();
    });

    it("should reject without authentication", async () => {
      mockAuthNone();

      const req = createTestRequest("/api/accounting/documents", {
        method: "POST",
        body: { type: "stock_receipt" },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should reject when viewer tries to create", async () => {
      mockAuthUser(viewerUser);

      const req = createTestRequest("/api/accounting/documents", {
        method: "POST",
        body: { type: "stock_receipt" },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("should reject with missing document type", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/documents", {
        method: "POST",
        body: {},
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.fields).toBeDefined();
    });
  });

  // ==========================================
  // GET /api/accounting/documents
  // ==========================================

  describe("GET /api/accounting/documents", () => {
    it("should return paginated documents", async () => {
      mockAuthUser(adminUser);
      await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocument({ type: "write_off", warehouseId: warehouse.id });

      const req = createTestRequest("/api/accounting/documents", {
        query: { page: "1", limit: "10" },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    it("should filter by document type", async () => {
      mockAuthUser(adminUser);
      await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocument({ type: "write_off", warehouseId: warehouse.id });

      const req = createTestRequest("/api/accounting/documents", {
        query: { type: "stock_receipt" },
      });

      const res = await GET(req);
      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].type).toBe("stock_receipt");
    });

    it("should filter by status", async () => {
      mockAuthUser(adminUser);
      await createDocument({ type: "stock_receipt", status: "draft" });
      await createDocument({ type: "stock_receipt", status: "confirmed", confirmedAt: new Date() });

      const req = createTestRequest("/api/accounting/documents", {
        query: { status: "draft" },
      });

      const res = await GET(req);
      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe("draft");
    });
  });

  // ==========================================
  // GET /api/accounting/documents/[id]
  // ==========================================

  describe("GET /api/accounting/documents/[id]", () => {
    it("should return document by id with items", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocumentItem(doc.id, product.id, { quantity: 5, price: 200 });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`);
      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.id).toBe(doc.id);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].quantity).toBe(5);
    });

    it("should return 404 for non-existent document", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/documents/nonexistent");
      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // PUT /api/accounting/documents/[id]
  // ==========================================

  describe("PUT /api/accounting/documents/[id]", () => {
    it("should update a draft document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`, {
        method: "PUT",
        body: { description: "Updated description" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.description).toBe("Updated description");
    });

    it("should replace document items on update", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocumentItem(doc.id, product.id, { quantity: 5, price: 100 });

      const product2 = await createProduct({ name: "Товар B" });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`, {
        method: "PUT",
        body: {
          items: [
            { productId: product2.id, quantity: 3, price: 200 },
          ],
        },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].product.name).toBe("Товар B");
      expect(data.totalAmount).toBe(600);
    });

    it("should reject update for confirmed document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        confirmedAt: new Date(),
      });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`, {
        method: "PUT",
        body: { description: "Changed" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // DELETE /api/accounting/documents/[id]
  // ==========================================

  describe("DELETE /api/accounting/documents/[id]", () => {
    it("should delete a draft document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt" });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const db = getTestDb();
      const deleted = await db.document.findUnique({ where: { id: doc.id } });
      expect(deleted).toBeNull();
    });

    it("should reject delete for confirmed document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        confirmedAt: new Date(),
      });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}`, {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // POST /api/accounting/documents/[id]/confirm
  // ==========================================

  describe("POST /api/accounting/documents/[id]/confirm", () => {
    it("should confirm a draft document with items", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 100 });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/confirm`, {
        method: "POST",
      });

      const res = await CONFIRM(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.status).toBe("confirmed");
      expect(data.confirmedAt).toBeDefined();
    });

    it("should reject confirming an already confirmed document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({
        type: "stock_receipt",
        status: "confirmed",
        confirmedAt: new Date(),
      });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/confirm`, {
        method: "POST",
      });

      const res = await CONFIRM(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(400);
    });

    it("should reject confirming a document with no items", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/confirm`, {
        method: "POST",
      });

      const res = await CONFIRM(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.error).toContain("без позиций");
    });

    it("should update stock after confirming stock_receipt", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", warehouseId: warehouse.id });
      await createDocumentItem(doc.id, product.id, { quantity: 15, price: 50 });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/confirm`, {
        method: "POST",
      });

      await CONFIRM(req, { params: Promise.resolve({ id: doc.id }) });

      // Verify stock was updated
      const db = getTestDb();
      const stock = await db.stockRecord.findFirst({
        where: { warehouseId: warehouse.id, productId: product.id },
      });
      expect(stock).not.toBeNull();
      expect(stock!.quantity).toBe(15);
    });
  });

  // ==========================================
  // POST /api/accounting/documents/[id]/cancel
  // ==========================================

  describe("POST /api/accounting/documents/[id]/cancel", () => {
    it("should cancel a confirmed document", async () => {
      mockAuthUser(adminUser);
      // First create and confirm a document
      const doc = await createDocument({
        type: "stock_receipt",
        warehouseId: warehouse.id,
        status: "confirmed",
        confirmedAt: new Date(),
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 100 });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, {
        method: "POST",
      });

      const res = await CANCEL(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.status).toBe("cancelled");
      expect(data.cancelledAt).toBeDefined();
    });

    it("should reject cancelling a draft document", async () => {
      mockAuthUser(adminUser);
      const doc = await createDocument({ type: "stock_receipt", status: "draft" });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, {
        method: "POST",
      });

      const res = await CANCEL(req, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(400);
    });
  });
});

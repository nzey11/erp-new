import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser, createWarehouse, createProduct, createDocument, createDocumentItem, createCounterparty } from "../../helpers/factories";
import { getTestDb } from "../../helpers/test-db";

// Mock auth module so we can control session
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return { ...actual, getAuthSession: vi.fn() };
});

import { POST as CONFIRM } from "@/app/api/accounting/documents/[id]/confirm/route";
import { POST as CANCEL } from "@/app/api/accounting/documents/[id]/cancel/route";
import { POST as CREATE_DOC } from "@/app/api/accounting/documents/route";

describe("API: inventory_count flow", () => {
  let adminUser: Awaited<ReturnType<typeof createUser>>;
  let warehouse: Awaited<ReturnType<typeof createWarehouse>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let product2: Awaited<ReturnType<typeof createProduct>>;
  let counterparty: Awaited<ReturnType<typeof createCounterparty>>;

  beforeEach(async () => {
    adminUser = await createUser({ role: "admin" });
    // tenantId matches the tenant created by createUser factory: "tenant-<userId>"
    const tenantId = `tenant-${adminUser.id}`;
    warehouse = await createWarehouse({ name: "Склад инвентаризации", tenantId });
    product = await createProduct({ name: "Товар А", tenantId });
    product2 = await createProduct({ name: "Товар Б", tenantId });
    counterparty = await createCounterparty({ name: "Поставщик списания", tenantId });
    mockAuthNone();
  });

  // =============================================
  // Helpers
  // =============================================

  async function createInventoryDoc(
    items: { productId: string; expectedQty: number; actualQty: number; price?: number }[]
  ) {
    const doc = await createDocument({
      type: "inventory_count",
      warehouseId: warehouse.id,
    });
    for (const item of items) {
      await createDocumentItem(doc.id, item.productId, {
        quantity: 0,
        price: item.price ?? 100,
        expectedQty: item.expectedQty,
        actualQty: item.actualQty,
      });
    }
    return doc;
  }

  async function confirmDoc(docId: string) {
    mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
    const req = createTestRequest(`/api/accounting/documents/${docId}/confirm`, {
      method: "POST",
    });
    return CONFIRM(req, { params: Promise.resolve({ id: docId }) });
  }

  async function createAdjustmentDoc(
    type: "write_off" | "stock_receipt",
    linkedDocId: string,
    items: { productId: string; quantity: number; price: number }[],
    counterpartyId?: string
  ) {
    mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
    const body: Record<string, unknown> = {
      type,
      status: "draft",
      warehouseId: warehouse.id,
      date: new Date().toISOString(),
      description: `На основании инвентаризации`,
      linkedDocumentId: linkedDocId,
      items,
    };
    if (counterpartyId) {
      body.counterpartyId = counterpartyId;
    }
    const req = createTestRequest("/api/accounting/documents", {
      method: "POST",
      body,
    });
    return CREATE_DOC(req);
  }

  // =============================================
  // Suite 1: Adjustment document creation
  // =============================================

  describe("confirm → manual adjustment document creation", () => {
    it("shortage → manual write_off linked doc can be created and confirmed", async () => {
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 10, actualQty: 6 }, // deficit: -4
      ]);

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(200);

      // Manually create write_off adjustment (as user would via UI)
      const adjRes = await createAdjustmentDoc("write_off", doc.id, [
        { productId: product.id, quantity: 4, price: 100 },
      ]);
      expect(adjRes.status).toBe(201);

      const db = getTestDb();
      const linkedDocs = await db.document.findMany({
        where: { linkedDocumentId: doc.id },
        include: { items: true },
      });

      expect(linkedDocs).toHaveLength(1);
      expect(linkedDocs[0].type).toBe("write_off");
      expect(linkedDocs[0].status).toBe("draft"); // Created as draft, not auto-confirmed
      expect(linkedDocs[0].items).toHaveLength(1);
      expect(linkedDocs[0].items[0].quantity).toBe(4);
    });

    it("surplus → manual stock_receipt linked doc can be created and confirmed", async () => {
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 5, actualQty: 8 }, // surplus: +3
      ]);

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(200);

      // Manually create stock_receipt adjustment
      const adjRes = await createAdjustmentDoc("stock_receipt", doc.id, [
        { productId: product.id, quantity: 3, price: 100 },
      ]);
      expect(adjRes.status).toBe(201);

      const db = getTestDb();
      const linkedDocs = await db.document.findMany({
        where: { linkedDocumentId: doc.id },
        include: { items: true },
      });

      expect(linkedDocs).toHaveLength(1);
      expect(linkedDocs[0].type).toBe("stock_receipt");
      expect(linkedDocs[0].status).toBe("draft");
      expect(linkedDocs[0].items[0].quantity).toBe(3);
    });

    it("mixed (shortage + surplus) → both write_off and stock_receipt can be created manually", async () => {
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 10, actualQty: 6 },  // shortage
        { productId: product2.id, expectedQty: 5, actualQty: 8 },  // surplus
      ]);

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(200);

      // Create both adjustments manually
      await createAdjustmentDoc("write_off", doc.id, [
        { productId: product.id, quantity: 4, price: 100 },
      ]);
      await createAdjustmentDoc("stock_receipt", doc.id, [
        { productId: product2.id, quantity: 3, price: 100 },
      ]);

      const db = getTestDb();
      const linkedDocs = await db.document.findMany({
        where: { linkedDocumentId: doc.id },
        include: { items: true },
      });

      expect(linkedDocs).toHaveLength(2);

      const types = linkedDocs.map((d) => d.type).sort();
      expect(types).toEqual(["stock_receipt", "write_off"]);

      const writeOff = linkedDocs.find((d) => d.type === "write_off")!;
      const receipt = linkedDocs.find((d) => d.type === "stock_receipt")!;
      expect(writeOff.items[0].quantity).toBe(4);
      expect(receipt.items[0].quantity).toBe(3);
    });

    it("no discrepancies → no adjustment docs needed", async () => {
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 10, actualQty: 10 }, // difference = 0
      ]);

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(200);

      const db = getTestDb();
      const linkedDocs = await db.document.findMany({
        where: { linkedDocumentId: doc.id },
      });
      expect(linkedDocs).toHaveLength(0);
    });
  });

  // =============================================
  // Suite 2: Confirm validation
  // =============================================

  describe("confirm validation", () => {
    it("rejects if any item has null actualQty", async () => {
      const doc = await createDocument({ type: "inventory_count", warehouseId: warehouse.id });
      // Only set expectedQty, leave actualQty undefined (null in DB)
      await createDocumentItem(doc.id, product.id, {
        quantity: 0,
        price: 100,
        expectedQty: 10,
      });

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.error).toContain("фактическое количество");
    });

    it("rejects if warehouseId is null", async () => {
      // Cannot use createDocument factory (it always assigns a warehouse),
      // so create directly via db and then clear warehouseId
      const docBase = await createDocument({ type: "inventory_count", tenantId: `tenant-${adminUser.id}` });
      const db = getTestDb();
      const doc = await db.document.update({
        where: { id: docBase.id },
        data: { warehouseId: null },
      });

      await createDocumentItem(doc.id, product.id, {
        quantity: 0,
        price: 100,
        expectedQty: 10,
        actualQty: 8,
      });

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.error).toContain("склад");
    });

    it("rejects if document has no items", async () => {
      const doc = await createDocument({ type: "inventory_count", warehouseId: warehouse.id });

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.error).toContain("без позиций");
    });

    it("rejects if document is already confirmed", async () => {
      const doc = await createDocument({
        type: "inventory_count",
        status: "confirmed",
        confirmedAt: new Date(),
        warehouseId: warehouse.id,
      });

      const res = await confirmDoc(doc.id);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      // State machine now returns a transition error (status machine message)
      expect(data.error).toBeTruthy();
    });
  });

  // =============================================
  // Suite 3: Stock movements after confirm
  // =============================================

  describe("stock movements after manual adjustment creation", () => {
    it("shortage → manual write_off confirmed creates StockMovement with negative qty", async () => {
      // First, create stock via incoming_shipment so we have something to write off
      const receiptDoc = await createDocument({
        type: "incoming_shipment",
        warehouseId: warehouse.id,
        counterpartyId: counterparty.id,
      });
      await createDocumentItem(receiptDoc.id, product.id, { quantity: 10, price: 100 });
      await confirmDoc(receiptDoc.id);

      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 10, actualQty: 6 }, // deficit: -4
      ]);

      await confirmDoc(doc.id);

      // Manually create and confirm write_off adjustment (write_off needs counterparty)
      const adjRes = await createAdjustmentDoc("write_off", doc.id, [
        { productId: product.id, quantity: 4, price: 100 },
      ], counterparty.id);
      expect(adjRes.status).toBe(201);
      const adjData = await (adjRes as unknown as Response).json();

      // Confirm the adjustment document to create stock movements
      const confirmRes = await confirmDoc(adjData.id);
      expect(confirmRes.status).toBe(200);

      const db = getTestDb();
      const confirmedDoc = await db.document.findUnique({ where: { id: adjData.id } });
      expect(confirmedDoc?.status).toBe("confirmed");

      const movements = await db.stockMovement.findMany({
        where: { documentId: adjData.id, isReversing: false },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(-4);
      expect(movements[0].type).toBe("write_off");
    });

    it("surplus → manual stock_receipt confirmed creates StockMovement with positive qty", async () => {
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 5, actualQty: 8 }, // surplus: +3
      ]);

      await confirmDoc(doc.id);

      // Manually create and confirm stock_receipt adjustment
      const adjRes = await createAdjustmentDoc("stock_receipt", doc.id, [
        { productId: product.id, quantity: 3, price: 100 },
      ]);
      expect(adjRes.status).toBe(201);
      const adjData = await (adjRes as unknown as Response).json();

      // Confirm the adjustment document
      await confirmDoc(adjData.id);

      const db = getTestDb();
      const movements = await db.stockMovement.findMany({
        where: { documentId: adjData.id, isReversing: false },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(3);
      expect(movements[0].type).toBe("receipt");
    });
  });

  // =============================================
  // Suite 4: Cancel inventory_count
  // =============================================

  describe("cancel confirmed inventory_count", () => {
    it("cancel sets status = 'cancelled'", async () => {
      mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
      const doc = await createDocument({
        type: "inventory_count",
        status: "confirmed",
        confirmedAt: new Date(),
        warehouseId: warehouse.id,
      });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, {
        method: "POST",
      });
      const res = await CANCEL(req, { params: Promise.resolve({ id: doc.id }) });

      expect(res.status).toBe(200);
      const data = await jsonResponse(res);
      expect(data.status).toBe("cancelled");
      expect(data.cancelledAt).toBeDefined();
    });

    it("cancel does NOT create reversing StockMovements (affectsStock = false for inventory_count)", async () => {
      mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
      const doc = await createDocument({
        type: "inventory_count",
        status: "confirmed",
        confirmedAt: new Date(),
        warehouseId: warehouse.id,
      });

      const req = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, {
        method: "POST",
      });
      await CANCEL(req, { params: Promise.resolve({ id: doc.id }) });

      const db = getTestDb();
      const movements = await db.stockMovement.findMany({
        where: { documentId: doc.id },
      });
      expect(movements).toHaveLength(0);
    });

    it("cancel does NOT cascade-cancel linked adjustment documents", async () => {
      // First, create stock via incoming_shipment so we have something to write off
      const receiptDoc = await createDocument({
        type: "incoming_shipment",
        warehouseId: warehouse.id,
        counterpartyId: counterparty.id,
      });
      await createDocumentItem(receiptDoc.id, product.id, { quantity: 10, price: 100 });
      await confirmDoc(receiptDoc.id);

      // Full cycle: confirm inventory_count, manually create write_off, then cancel parent
      const doc = await createInventoryDoc([
        { productId: product.id, expectedQty: 10, actualQty: 6 }, // shortage: -4
      ]);
      await confirmDoc(doc.id);

      // Manually create linked write_off adjustment (write_off needs counterparty)
      const adjRes = await createAdjustmentDoc("write_off", doc.id, [
        { productId: product.id, quantity: 4, price: 100 },
      ], counterparty.id);
      expect(adjRes.status).toBe(201);
      const adjData = await (adjRes as unknown as Response).json();

      // Confirm the adjustment document
      const confirmRes = await confirmDoc(adjData.id);
      expect(confirmRes.status).toBe(200);

      mockAuthUser({ ...adminUser, tenantId: `tenant-${adminUser.id}` });
      const cancelReq = createTestRequest(`/api/accounting/documents/${doc.id}/cancel`, {
        method: "POST",
      });
      const res = await CANCEL(cancelReq, { params: Promise.resolve({ id: doc.id }) });
      expect(res.status).toBe(200);

      // Linked write_off must remain "confirmed" — cancel route does not cascade
      const db = getTestDb();
      const linkedDocs = await db.document.findMany({
        where: { linkedDocumentId: doc.id },
      });
      expect(linkedDocs.length).toBeGreaterThan(0);
      expect(linkedDocs.every((d) => d.status === "confirmed")).toBe(true);
    });
  });
});

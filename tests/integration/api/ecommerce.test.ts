import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse } from "../../helpers/api-client";
import {
  createUnit,
  createProduct,
  createCategory,
  createSalePrice,
  createCustomer,
  createCartItem,
  createOrder,
  createOrderItem,
  createProductDiscount,
} from "../../helpers/factories";
import { getTestDb } from "../../helpers/test-db";

// Mock customer auth module
vi.mock("@/lib/shared/customer-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/customer-auth")>();
  return {
    ...actual,
    getCustomerSession: vi.fn(),
    requireCustomer: vi.fn(),
  };
});

import * as customerAuth from "@/lib/shared/customer-auth";

// Import route handlers
import { GET as getCart, POST as addToCart, DELETE as removeFromCart } from "@/app/api/ecommerce/cart/route";
import { POST as checkout } from "@/app/api/ecommerce/checkout/route";
import { POST as quickOrder } from "@/app/api/ecommerce/orders/quick-order/route";
import { GET as getOrders } from "@/app/api/ecommerce/orders/route";
import { GET as getCustomerMe, PATCH as updateProfile } from "@/app/api/auth/customer/me/route";

function mockCustomer(customer: { id: string; telegramId: string; telegramUsername?: string | null; name?: string | null; phone?: string | null; email?: string | null; isActive?: boolean }) {
  vi.mocked(customerAuth.getCustomerSession).mockResolvedValue({
    id: customer.id,
    telegramId: customer.telegramId,
    telegramUsername: customer.telegramUsername ?? null,
    name: customer.name ?? null,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    isActive: customer.isActive ?? true,
  });
  vi.mocked(customerAuth.requireCustomer).mockResolvedValue({
    id: customer.id,
    telegramId: customer.telegramId,
    telegramUsername: customer.telegramUsername ?? null,
    name: customer.name ?? null,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    isActive: customer.isActive ?? true,
  });
}

function mockNoCustomer() {
  vi.mocked(customerAuth.getCustomerSession).mockResolvedValue(null);
  vi.mocked(customerAuth.requireCustomer).mockRejectedValue(
    new customerAuth.CustomerAuthError("Unauthorized", 401)
  );
}

describe("API: E-commerce Cart & Orders", () => {
  let unit: Awaited<ReturnType<typeof createUnit>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;

  beforeEach(async () => {
    unit = await createUnit({ name: "Штука", shortName: "шт" });
    customer = await createCustomer({ name: "Тестовый Покупатель", phone: "+79001234567" });
    mockNoCustomer();
  });

  // ==========================================
  // Cart API
  // ==========================================

  describe("GET /api/ecommerce/cart", () => {
    it("should return empty cart for new customer", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/ecommerce/cart");
      const res = await getCart(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.items).toHaveLength(0);
    });

    it("should return cart items", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "Тест Товар", unitId: unit.id, publishedToStore: true });
      await createSalePrice(product.id, { price: 5000 });
      await createCartItem(customer.id, product.id, { priceSnapshot: 5000, quantity: 2 });

      const req = createTestRequest("/api/ecommerce/cart");
      const res = await getCart(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].productName).toBe("Тест Товар");
      expect(data.items[0].quantity).toBe(2);
    });

    it("should reject unauthenticated", async () => {
      mockNoCustomer();
      const req = createTestRequest("/api/ecommerce/cart");
      const res = await getCart(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/ecommerce/cart", () => {
    it("should add item to cart", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "Новый Товар", unitId: unit.id, publishedToStore: true });
      await createSalePrice(product.id, { price: 3000 });

      const req = createTestRequest("/api/ecommerce/cart", {
        method: "POST",
        body: { productId: product.id, quantity: 3 },
      });

      const res = await addToCart(req);
      expect(res.status).toBe(200);

      // Verify in DB
      const db = getTestDb();
      const cartItem = await db.cartItem.findFirst({
        where: { customerId: customer.id, productId: product.id },
      });
      expect(cartItem).not.toBeNull();
      expect(cartItem!.quantity).toBe(3);
    });

    it("should upsert quantity for existing item", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "Existing", unitId: unit.id, publishedToStore: true });
      await createSalePrice(product.id, { price: 1000 });
      await createCartItem(customer.id, product.id, { priceSnapshot: 1000, quantity: 2 });

      const req = createTestRequest("/api/ecommerce/cart", {
        method: "POST",
        body: { productId: product.id, quantity: 3 },
      });

      const res = await addToCart(req);
      expect(res.status).toBe(200);

      const db = getTestDb();
      const items = await db.cartItem.findMany({
        where: { customerId: customer.id, productId: product.id },
      });
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(5); // 2 + 3
    });
  });

  describe("DELETE /api/ecommerce/cart", () => {
    it("should remove item from cart", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "To Remove", unitId: unit.id });
      const cartItem = await createCartItem(customer.id, product.id, { priceSnapshot: 1000 });

      const req = createTestRequest("/api/ecommerce/cart", {
        method: "DELETE",
        query: { itemId: cartItem.id },
      });

      const res = await removeFromCart(req);
      expect(res.status).toBe(200);

      const db = getTestDb();
      const remaining = await db.cartItem.findMany({
        where: { customerId: customer.id },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  // ==========================================
  // Checkout
  // ==========================================

  describe("POST /api/ecommerce/checkout", () => {
    it("should create order from cart", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "Checkout Item", unitId: unit.id, publishedToStore: true });
      await createSalePrice(product.id, { price: 2500 });
      await createCartItem(customer.id, product.id, { priceSnapshot: 2500, quantity: 2 });

      const req = createTestRequest("/api/ecommerce/checkout", {
        method: "POST",
        body: { deliveryType: "pickup" },
      });

      const res = await checkout(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.orderNumber).toBeDefined();
      expect(data.totalAmount).toBe(5000);

      // Cart should be cleared
      const db = getTestDb();
      const cartItems = await db.cartItem.findMany({
        where: { customerId: customer.id },
      });
      expect(cartItems).toHaveLength(0);

      // Order should exist with items
      const order = await db.order.findUnique({
        where: { id: data.orderId },
        include: { items: true },
      });
      expect(order).not.toBeNull();
      expect(order!.items).toHaveLength(1);
      expect(order!.items[0].quantity).toBe(2);
    });

    it("should reject empty cart", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/ecommerce/checkout", {
        method: "POST",
        body: { deliveryType: "pickup" },
      });

      const res = await checkout(req);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Quick Order
  // ==========================================

  describe("POST /api/ecommerce/orders/quick-order", () => {
    it("should create a quick order without authentication", async () => {
      const product = await createProduct({ name: "Quick Item", unitId: unit.id, publishedToStore: true });
      await createSalePrice(product.id, { price: 1500 });

      const req = createTestRequest("/api/ecommerce/orders/quick-order", {
        method: "POST",
        body: {
          productId: product.id,
          quantity: 1,
          customerName: "Иван Иванов",
          customerPhone: "+79009876543",
        },
      });

      const res = await quickOrder(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.orderNumber).toBeDefined();

      // Customer should be created
      const db = getTestDb();
      const newCustomer = await db.customer.findFirst({
        where: { phone: "+79009876543" },
      });
      expect(newCustomer).not.toBeNull();
    });

    it("should reject for inactive product", async () => {
      const product = await createProduct({ name: "Inactive", unitId: unit.id, isActive: false });

      const req = createTestRequest("/api/ecommerce/orders/quick-order", {
        method: "POST",
        body: {
          productId: product.id,
          quantity: 1,
          customerName: "Test",
          customerPhone: "+79001111111",
        },
      });

      const res = await quickOrder(req);
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Customer Profile
  // ==========================================

  describe("GET /api/auth/customer/me", () => {
    it("should return authenticated customer", async () => {
      mockCustomer(customer);

      const res = await getCustomerMe();
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.name).toBe("Тестовый Покупатель");
    });

    it("should return 401 when not authenticated", async () => {
      mockNoCustomer();
      const res = await getCustomerMe();
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/auth/customer/me", () => {
    it("should update customer name", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/auth/customer/me", {
        method: "POST",
        body: { name: "Новое Имя" },
      });

      const res = await updateProfile(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.name).toBe("Новое Имя");

      // Verify in DB
      const db = getTestDb();
      const updated = await db.customer.findUnique({ where: { id: customer.id } });
      expect(updated!.name).toBe("Новое Имя");
    });

    it("should update email to null", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/auth/customer/me", {
        method: "POST",
        body: { email: null },
      });

      const res = await updateProfile(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.email).toBeNull();
    });

    it("should reject invalid email", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/auth/customer/me", {
        method: "POST",
        body: { email: "not-an-email" },
      });

      const res = await updateProfile(req);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Customer Orders
  // ==========================================

  describe("GET /api/ecommerce/orders", () => {
    it("should return customer orders", async () => {
      mockCustomer(customer);
      const product = await createProduct({ name: "Ordered Item", unitId: unit.id });
      const order = await createOrder(customer.id, { orderNumber: "ORD-000001", totalAmount: 5000 });
      await createOrderItem(order.id, product.id, { quantity: 2, price: 2500 });

      const req = createTestRequest("/api/ecommerce/orders");
      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].orderNumber).toBe("ORD-000001");
      expect(data.orders[0].items).toHaveLength(1);
    });

    it("should return empty for customer with no orders", async () => {
      mockCustomer(customer);

      const req = createTestRequest("/api/ecommerce/orders");
      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.orders).toHaveLength(0);
    });
  });
});

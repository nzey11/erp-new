import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { createTestRequest, jsonResponse } from "../../helpers/api-client";
import { db } from "@/lib/shared/db";
import { POST as telegramLogin } from "@/app/api/auth/customer/telegram/route";

const TEST_BOT_TOKEN = "integration_test_bot_token_xyz";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Compute a valid Telegram HMAC hash for the given fields (excluding `hash` itself).
 * Mirrors the algorithm used in the route's verifyTelegramAuth.
 */
function buildValidHash(fields: Record<string, string>): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(TEST_BOT_TOKEN).digest();
  return crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
}

/**
 * Build a complete, signed Telegram auth payload ready to POST.
 */
function buildTelegramPayload(opts: {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  authDateOffset?: number; // seconds relative to now (default 0)
}): Record<string, string | number> {
  const authDate = Math.floor(Date.now() / 1000) + (opts.authDateOffset ?? 0);
  const fields: Record<string, string> = {
    id: opts.id,
    auth_date: String(authDate),
  };
  if (opts.first_name) fields.first_name = opts.first_name;
  if (opts.last_name) fields.last_name = opts.last_name;
  if (opts.username) fields.username = opts.username;

  return { ...fields, hash: buildValidHash(fields), auth_date: authDate };
}

/**
 * Create (upsert) a Telegram integration record in the test DB.
 */
async function createTelegramIntegration(isEnabled = true) {
  await db.integration.upsert({
    where: { type: "telegram" },
    create: {
      type: "telegram",
      name: "Telegram Bot",
      isEnabled,
      settings: {
        botToken: TEST_BOT_TOKEN,
        botUsername: "test_bot",
        enableStoreLogin: true,
        enableAdminLogin: false,
      },
    },
    update: {
      isEnabled,
      settings: {
        botToken: TEST_BOT_TOKEN,
        botUsername: "test_bot",
        enableStoreLogin: true,
        enableAdminLogin: false,
      },
    },
  });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("API: POST /api/auth/customer/telegram", () => {
  // ==========================================
  // Configuration errors
  // ==========================================

  describe("when Telegram is not configured", () => {
    it("should return 500 if no integration record and no env bot token", async () => {
      // cleanDatabase() in beforeEach already removed any integration record.
      // TELEGRAM_BOT_TOKEN is not set in .env.test.
      const payload = buildTelegramPayload({ id: "111" });
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(500);

      const data = await jsonResponse(res);
      expect(data.error).toMatch(/не настроен/i);
    });

    it("should return 500 if integration is disabled in DB", async () => {
      await createTelegramIntegration(false); // isEnabled = false
      const payload = buildTelegramPayload({ id: "112" });
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      // Disabled integration → getBotToken returns null → 500
      expect(res.status).toBe(500);
    });
  });

  // ==========================================
  // Validation errors
  // ==========================================

  describe("validation", () => {
    beforeEach(async () => {
      await createTelegramIntegration();
    });

    it("should return 400 when body is empty", async () => {
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: {},
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(400);
    });

    it("should return 400 when hash is missing", async () => {
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: { id: 123456, auth_date: Math.floor(Date.now() / 1000) },
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(400);
    });

    it("should return 400 when auth_date is missing", async () => {
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: { id: 123456, hash: "somehash" },
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Authentication errors
  // ==========================================

  describe("authentication verification", () => {
    beforeEach(async () => {
      await createTelegramIntegration();
    });

    it("should return 401 when hash is invalid", async () => {
      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: {
          id: 999000,
          auth_date: Math.floor(Date.now() / 1000),
          hash: "0".repeat(64), // valid hex length but wrong value
        },
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(401);

      const data = await jsonResponse(res);
      expect(data.error).toMatch(/invalid telegram/i);
    });

    it("should return 401 when auth_date is expired (> 86400s ago)", async () => {
      const payload = buildTelegramPayload({
        id: "300400500",
        authDateOffset: -90000, // 25 hours ago
      });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Successful login
  // ==========================================

  describe("successful login", () => {
    beforeEach(async () => {
      await createTelegramIntegration();
    });

    it("should create a new customer on first login and return their profile", async () => {
      const payload = buildTelegramPayload({
        id: "100200300",
        first_name: "Ivan",
        last_name: "Petrov",
        username: "ivan_test",
      });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.telegramUsername).toBe("ivan_test");
      expect(data.id).toBeDefined();

      // Customer must exist in DB
      const customer = await db.customer.findUnique({
        where: { telegramId: "100200300" },
      });
      expect(customer).not.toBeNull();
      expect(customer!.name).toBe("Ivan Petrov");
      expect(customer!.telegramUsername).toBe("ivan_test");
    });

    it("should set a customer_session cookie on successful login", async () => {
      const payload = buildTelegramPayload({ id: "400500600", username: "cookie_test" });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("customer_session=");
    });

    it("should update username and name when existing customer logs in again", async () => {
      // Pre-create a customer with old info
      await db.customer.create({
        data: {
          telegramId: "555666777",
          telegramUsername: "old_username",
          name: "Old Name",
          isActive: true,
        },
      });

      const payload = buildTelegramPayload({
        id: "555666777",
        first_name: "New",
        last_name: "Name",
        username: "new_username",
      });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(200);

      const customer = await db.customer.findUnique({
        where: { telegramId: "555666777" },
      });
      expect(customer!.telegramUsername).toBe("new_username");
      expect(customer!.name).toBe("New Name");
    });

    it("should not overwrite existing name when login payload has no first/last_name", async () => {
      await db.customer.create({
        data: {
          telegramId: "888999000",
          telegramUsername: "kept_user",
          name: "Preserved Name",
          isActive: true,
        },
      });

      // Payload without first_name/last_name
      const payload = buildTelegramPayload({ id: "888999000" });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(200);

      const customer = await db.customer.findUnique({
        where: { telegramId: "888999000" },
      });
      // name should remain unchanged because join of empty array yields ""
      // and route does: name || customer.name
      expect(customer!.name).toBe("Preserved Name");
    });
  });

  // ==========================================
  // Deactivated customer
  // ==========================================

  describe("deactivated customer", () => {
    beforeEach(async () => {
      await createTelegramIntegration();
    });

    it("should return 403 when customer account is deactivated", async () => {
      await db.customer.create({
        data: {
          telegramId: "777888999",
          telegramUsername: "banned",
          isActive: false,
        },
      });

      const payload = buildTelegramPayload({ id: "777888999" });

      const req = createTestRequest("/api/auth/customer/telegram", {
        method: "POST",
        body: payload,
      });

      const res = await telegramLogin(req);
      expect(res.status).toBe(403);

      const data = await jsonResponse(res);
      expect(data.error).toMatch(/deactivated/i);
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser } from "../../helpers/factories";
import { hash } from "bcryptjs";

// Mock the auth module so we can control session
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return {
    ...actual,
    getAuthSession: vi.fn(),
  };
});

// Import route handlers
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { POST as SETUP } from "@/app/api/auth/setup/route";
import { GET as ME } from "@/app/api/auth/me/route";

describe("API: Auth", () => {
  // ==========================================
  // POST /api/auth/setup
  // ==========================================

  describe("POST /api/auth/setup", () => {
    it("should create admin user when no users exist", async () => {
      const req = createTestRequest("/api/auth/setup", {
        method: "POST",
        body: {
          username: "admin",
          password: "password123",
        },
      });

      const res = await SETUP(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.user.username).toBe("admin");
      expect(data.user.role).toBe("admin");
    });

    it("should reject setup when users already exist", async () => {
      await createUser({ username: "existing" });

      const req = createTestRequest("/api/auth/setup", {
        method: "POST",
        body: {
          username: "admin2",
          password: "password123",
        },
      });

      const res = await SETUP(req);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.error).toBeDefined();
    });

    it("should reject with short password", async () => {
      const req = createTestRequest("/api/auth/setup", {
        method: "POST",
        body: {
          username: "admin",
          password: "123",
        },
      });

      const res = await SETUP(req);
      expect(res.status).toBe(400);

      const data = await jsonResponse(res);
      expect(data.fields).toBeDefined();
    });

    it("should reject with missing fields", async () => {
      const req = createTestRequest("/api/auth/setup", {
        method: "POST",
        body: {},
      });

      const res = await SETUP(req);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // POST /api/auth/login
  // ==========================================

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      const passwordHash = await hash("secret123", 12);
      await createUser({ username: "testuser", password: passwordHash });

      const req = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "testuser",
          password: "secret123",
        },
      });

      const res = await LOGIN(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.user.username).toBe("testuser");

      // Should set session cookie
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("session=");
    });

    it("should reject with wrong password", async () => {
      const passwordHash = await hash("secret123", 12);
      await createUser({ username: "testuser", password: passwordHash });

      const req = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "testuser",
          password: "wrongpassword",
        },
      });

      const res = await LOGIN(req);
      expect(res.status).toBe(401);
    });

    it("should reject with non-existent username", async () => {
      const req = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "nobody",
          password: "password123",
        },
      });

      const res = await LOGIN(req);
      expect(res.status).toBe(401);
    });

    it("should reject inactive user", async () => {
      const passwordHash = await hash("secret123", 12);
      await createUser({ username: "inactive", password: passwordHash, isActive: false });

      const req = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: "inactive",
          password: "secret123",
        },
      });

      const res = await LOGIN(req);
      expect(res.status).toBe(401);
    });

    it("should reject with missing fields", async () => {
      const req = createTestRequest("/api/auth/login", {
        method: "POST",
        body: {},
      });

      const res = await LOGIN(req);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // GET /api/auth/me
  // ==========================================

  describe("GET /api/auth/me", () => {
    it("should return current user when authenticated", async () => {
      const user = await createUser({ username: "current_user", role: "manager" });
      mockAuthUser(user);

      const _req = createTestRequest("/api/auth/me");
      const res = await ME();
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.user.username).toBe("current_user");
      expect(data.user.role).toBe("manager");
    });

    it("should return 401 when not authenticated", async () => {
      mockAuthNone();

      const res = await ME();
      expect(res.status).toBe(401);
    });
  });
});

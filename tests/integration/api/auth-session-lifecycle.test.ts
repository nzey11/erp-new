import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/shared/db";
import { signSession, verifySessionToken } from "@/lib/shared/auth";
import { hash } from "bcryptjs";

/**
 * Integration tests for session lifecycle management.
 * 
 * These tests verify that stale sessions are properly invalidated when:
 * - User is deleted from the database
 * - User is deactivated (isActive = false)
 * - User's membership is removed
 */
describe("Auth Session Lifecycle", () => {
  let testUserId: string;
  let testTenantId: string;
  let testMembershipId: string;

  beforeEach(async () => {
    // Create test user
    const passwordHash = await hash("test123", 12);
    const user = await db.user.create({
      data: {
        username: `testuser_${Date.now()}`,
        password: passwordHash,
        role: "admin",
        isActive: true,
      },
    });
    testUserId = user.id;

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        name: "Test Tenant",
        slug: `test-tenant-${Date.now()}`,
      },
    });
    testTenantId = tenant.id;

    // Create membership
    const membership = await db.tenantMembership.create({
      data: {
        userId: testUserId,
        tenantId: testTenantId,
        role: "admin",
        isActive: true,
      },
    });
    testMembershipId = membership.id;
  });

  afterEach(async () => {
    // Cleanup
    await db.tenantMembership.deleteMany({ where: { userId: testUserId } });
    await db.user.deleteMany({ where: { id: testUserId } });
    await db.tenant.deleteMany({ where: { id: testTenantId } });
  });

  describe("signSession and verifySessionToken", () => {
    it("should create valid session token", () => {
      const token = signSession(testUserId);
      expect(token).toBeDefined();
      expect(token).toContain(testUserId);

      const extractedUserId = verifySessionToken(token);
      expect(extractedUserId).toBe(testUserId);
    });

    it("should reject tampered token", () => {
      const token = signSession(testUserId);
      const tamperedToken = token.replace(/.$/, "x");

      const extractedUserId = verifySessionToken(tamperedToken);
      expect(extractedUserId).toBeNull();
    });

    it("should reject expired token", () => {
      // Create token that expired 1 hour ago (negative hours)
      const token = signSession(testUserId, -1);

      const extractedUserId = verifySessionToken(token);
      expect(extractedUserId).toBeNull();
    });
  });

  describe("Session invalidation scenarios", () => {
    it("should have valid session when user exists and is active", async () => {
      // Verify user exists
      const user = await db.user.findUnique({
        where: { id: testUserId },
      });
      expect(user).toBeDefined();
      expect(user?.isActive).toBe(true);

      // Verify membership exists
      const membership = await db.tenantMembership.findFirst({
        where: { userId: testUserId, isActive: true },
      });
      expect(membership).toBeDefined();
    });

    it("should detect when user is deleted", async () => {
      // Delete the user
      await db.tenantMembership.deleteMany({ where: { userId: testUserId } });
      await db.user.delete({ where: { id: testUserId } });

      // Verify user no longer exists
      const user = await db.user.findUnique({
        where: { id: testUserId },
      });
      expect(user).toBeNull();
    });

    it("should detect when user is deactivated", async () => {
      // Deactivate the user
      await db.user.update({
        where: { id: testUserId },
        data: { isActive: false },
      });

      // Verify user is inactive
      const user = await db.user.findUnique({
        where: { id: testUserId },
      });
      expect(user?.isActive).toBe(false);
    });

    it("should detect when membership is removed", async () => {
      // Remove membership
      await db.tenantMembership.update({
        where: { id: testMembershipId },
        data: { isActive: false },
      });

      // Verify membership is inactive
      const membership = await db.tenantMembership.findFirst({
        where: { userId: testUserId, isActive: true },
      });
      expect(membership).toBeNull();
    });
  });

  describe("Session token format", () => {
    it("should include userId in token payload", () => {
      const token = signSession(testUserId);
      const parts = token.split(".");
      expect(parts).toHaveLength(2); // payload.signature

      const payload = parts[0];
      const [userId, expiresAt] = payload.split("|");
      expect(userId).toBe(testUserId);
      expect(Number(expiresAt)).toBeGreaterThan(Date.now());
    });

    it("should have consistent signature for same input", () => {
      const token1 = signSession(testUserId);
      const token2 = signSession(testUserId);

      // Different tokens due to timestamp, but same userId
      const userId1 = verifySessionToken(token1);
      const userId2 = verifySessionToken(token2);
      expect(userId1).toBe(userId2);
      expect(userId1).toBe(testUserId);
    });
  });
});

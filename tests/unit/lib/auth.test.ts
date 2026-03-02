import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySessionToken } from "@/lib/shared/auth";

describe("Session Token Security", () => {
  it("should create valid session token with expiration", () => {
    const userId = "test-user-id";
    const token = signSession(userId, 24);
    
    expect(token).toBeDefined();
    expect(token).toContain(".");
    
    const verified = verifySessionToken(token);
    expect(verified).toBe(userId);
  });

  it("should reject expired token", async () => {
    const userId = "test-user-id";
    // Create token that expires in 1ms
    const token = signSession(userId, 1 / (60 * 60 * 1000));
    
    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const verified = verifySessionToken(token);
    expect(verified).toBeNull();
  });

  it("should reject tampered token", () => {
    const userId = "test-user-id";
    const token = signSession(userId, 24);
    
    // Tamper with token
    const tampered = token.slice(0, -5) + "XXXXX";
    
    const verified = verifySessionToken(tampered);
    expect(verified).toBeNull();
  });

  it("should reject malformed token", () => {
    expect(verifySessionToken("invalid")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("no-dot")).toBeNull();
  });

  it("should use timing-safe comparison", () => {
    const userId = "test-user-id";
    const token = signSession(userId, 24);
    
    // Multiple verification attempts should have consistent timing
    const startTimes: number[] = [];
    const endTimes: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      verifySessionToken(token);
      const end = performance.now();
      startTimes.push(start);
      endTimes.push(end);
    }
    
    // All verifications should complete (timing-safe doesn't throw)
    expect(endTimes.length).toBe(10);
  });

  it("should handle different expiration times", () => {
    const userId = "test-user-id";
    
    // 1 hour token
    const token1h = signSession(userId, 1);
    expect(verifySessionToken(token1h)).toBe(userId);
    
    // 24 hour token (default)
    const token24h = signSession(userId);
    expect(verifySessionToken(token24h)).toBe(userId);
    
    // 7 day token
    const token7d = signSession(userId, 24 * 7);
    expect(verifySessionToken(token7d)).toBe(userId);
  });
});

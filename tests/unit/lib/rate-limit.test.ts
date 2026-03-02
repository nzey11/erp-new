import { describe, it, expect } from "vitest";
import { rateLimit, getClientIp, type RateLimitResult } from "@/lib/shared/rate-limit";

describe("Rate Limiter", () => {
  const identifier = "test-ip-123";

  it("should allow requests within limit", () => {
    const limit = 5;
    const id = `test-within-${Date.now()}`; // fixed id for all iterations
    
    // First 5 requests should succeed
    for (let i = 0; i < limit; i++) {
      const result = rateLimit(id, limit);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }
  });

  it("should block requests over limit", () => {
    const limit = 3;
    const id = `test-over-${Date.now()}`;
    
    // Use up the limit
    for (let i = 0; i < limit; i++) {
      rateLimit(id, limit);
    }
    
    // Next request should be blocked
    const result = rateLimit(id, limit);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should reset after window expires", async () => {
    const limit = 2;
    const windowMs = 100; // 100ms window
    const id = `test-reset-${Date.now()}`;
    
    // Use up the limit
    rateLimit(id, limit, windowMs);
    rateLimit(id, limit, windowMs);
    
    // Should be blocked
    let result = rateLimit(id, limit, windowMs);
    expect(result.success).toBe(false);
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, windowMs + 50));
    
    // Should be allowed again
    result = rateLimit(id, limit, windowMs);
    expect(result.success).toBe(true);
  });

  it("should track different identifiers separately", () => {
    const limit = 3;
    const id1 = `test-separate-1-${Date.now()}`;
    const id2 = `test-separate-2-${Date.now()}`;
    
    // Use up limit for id1
    for (let i = 0; i < limit; i++) {
      rateLimit(id1, limit);
    }
    
    // id1 should be blocked
    expect(rateLimit(id1, limit).success).toBe(false);
    
    // id2 should still be allowed
    expect(rateLimit(id2, limit).success).toBe(true);
  });

  it("should return correct rate limit metadata", () => {
    const limit = 5;
    const windowMs = 60000;
    const id = `test-metadata-${Date.now()}`;
    
    const result = rateLimit(id, limit, windowMs);
    
    expect(result.limit).toBe(limit);
    expect(result.remaining).toBe(limit - 1);
    expect(result.reset).toBeGreaterThan(Date.now());
    expect(result.reset).toBeLessThanOrEqual(Date.now() + windowMs);
  });

  it("should handle rapid sequential requests", () => {
    const limit = 10;
    const id = `test-rapid-${Date.now()}`;
    
    // Make 10 rapid requests
    const results: RateLimitResult[] = [];
    for (let i = 0; i < limit; i++) {
      results.push(rateLimit(id, limit));
    }
    
    // All should succeed
    expect(results.every(r => r.success)).toBe(true);
    
    // 11th should fail
    const lastResult = rateLimit(id, limit);
    expect(lastResult.success).toBe(false);
  });
});

describe("getClientIp", () => {
  it("should extract IP from x-forwarded-for header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.1, 198.51.100.1",
      },
    });
    
    expect(getClientIp(request)).toBe("203.0.113.1");
  });

  it("should extract IP from x-real-ip header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-real-ip": "203.0.113.42",
      },
    });
    
    expect(getClientIp(request)).toBe("203.0.113.42");
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-real-ip": "203.0.113.42",
      },
    });
    
    expect(getClientIp(request)).toBe("203.0.113.1");
  });

  it("should return unknown when no IP headers present", () => {
    const request = new Request("http://localhost");
    
    expect(getClientIp(request)).toBe("unknown");
  });

  it("should handle multiple IPs in x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "  203.0.113.1  ,  198.51.100.1  ,  192.0.2.1  ",
      },
    });
    
    // Should trim and return first IP
    expect(getClientIp(request)).toBe("203.0.113.1");
  });
});

/**
 * ⚠️ WARNING: In-Memory Rate Limiter
 * 
 * This implementation uses an in-memory Map for rate limiting.
 * It works for single-instance deployments but has limitations:
 * 
 * - NOT suitable for multi-instance/serverless deployments
 * - Rate limits are NOT shared between instances
 * - State is LOST on server restart
 * 
 * For production with multiple instances, use Redis-based solution:
 * - @upstash/ratelimit (recommended for Vercel/serverless)
 * - redis-rate-limiter
 * - express-rate-limit with Redis store
 * 
 * Required env vars for Redis:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 * 
 * See: https://github.com/upstash/ratelimit
 */

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based solution like @upstash/ratelimit
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries on demand (no setInterval in Edge Runtime)
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check if request is rate limited
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param limit - Max requests per window
 * @param windowMs - Time window in milliseconds
 */
export function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000 // 1 minute default
): RateLimitResult {
  // Clean up expired entries on each call (lazy cleanup)
  if (store.size > 100) { // Only cleanup if map is getting large
    cleanupExpiredEntries();
  }
  
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    // Create new window
    const resetAt = now + windowMs;
    store.set(identifier, { count: 1, resetAt });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: resetAt,
    };
  }

  // Increment counter
  entry.count++;
  store.set(identifier, entry);

  const remaining = Math.max(0, limit - entry.count);
  const success = entry.count <= limit;

  return {
    success,
    limit,
    remaining,
    reset: entry.resetAt,
  };
}

/**
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return "unknown";
}

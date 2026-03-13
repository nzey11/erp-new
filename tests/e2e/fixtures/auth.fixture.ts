import crypto from "crypto";
import { hash } from "bcryptjs";
import { createUser } from "./database.fixture";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-for-testing-only";

// Fixed tenant ID for e2e tests - all test data should use this tenantId
export const E2E_TENANT_ID = "e2e-default-tenant";

/** Sign a userId into a session token (mirrors lib/shared/auth.ts format: userId|expiresAt.signature) */
export function signSession(userId: string): string {
  const expiresAt = Date.now() + 24 * 7 * 60 * 60 * 1000; // 7 days
  const payload = `${userId}|${expiresAt}`;
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Generate a CSRF token (mirrors lib/shared/csrf.ts using Web Crypto API)
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Sign a CSRF token using Web Crypto API HMAC-SHA256 (exactly mirrors lib/shared/csrf.ts)
 */
export async function signCsrfToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SESSION_SECRET);
  const tokenData = encoder.encode(token);

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign("HMAC", key, tokenData);
  const signatureHex = Buffer.from(signature).toString("hex");
  return `${token}.${signatureHex}`;
}

/**
 * Create CSRF tokens for testing.
 * Returns both the raw token (for X-CSRF-Token header) and signed token (for csrf_token cookie)
 */
export async function createCsrfTokens(): Promise<{
  rawToken: string;
  signedToken: string;
}> {
  const rawToken = generateCsrfToken();
  const signedToken = await signCsrfToken(rawToken);
  return { rawToken, signedToken };
}

/** Create an admin user in the DB and return its session cookie value */
export async function createAdminSession(): Promise<{
  user: { id: string; username: string; role: string; tenantId: string };
  sessionToken: string;
}> {
  const passwordHash = await hash("admin123", 10);
  const user = await createUser({
    username: "e2e_admin",
    password: passwordHash,
    role: "admin",
    tenantId: E2E_TENANT_ID,
  });

  const sessionToken = signSession(user.id);
  return {
    user: { id: user.id, username: user.username as string, role: user.role as string, tenantId: user.tenantId },
    sessionToken,
  };
}

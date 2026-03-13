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

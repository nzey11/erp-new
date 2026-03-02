import crypto from "crypto";
import { hash } from "bcryptjs";
import { createUser } from "./database.fixture";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-for-testing-only";

/** Sign a userId into a session token (mirrors lib/shared/auth.ts) */
export function signSession(userId: string): string {
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(userId).digest("hex");
  return `${userId}.${signature}`;
}

/** Create an admin user in the DB and return its session cookie value */
export async function createAdminSession(): Promise<{
  user: { id: string; username: string; role: string };
  sessionToken: string;
}> {
  const passwordHash = await hash("admin123", 10);
  const user = await createUser({
    username: "e2e_admin",
    password: passwordHash,
    role: "admin",
  });

  const sessionToken = signSession(user.id);
  return {
    user: { id: user.id, username: user.username as string, role: user.role as string },
    sessionToken,
  };
}

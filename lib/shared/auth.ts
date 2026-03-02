import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set in environment variables");
  }
  return secret;
}

interface SessionData {
  userId: string;
  exp: number; // Unix timestamp in milliseconds
}

/** Sign a user ID to create a tamper-proof session token with expiration. Format: base64(data).hmacSignature */
export function signSession(userId: string, expiresInHours: number = 24): string {
  const secret = getSessionSecret();
  const exp = Date.now() + expiresInHours * 60 * 60 * 1000; // 24 hours default
  const data: SessionData = { userId, exp };
  const dataStr = JSON.stringify(data);
  const dataB64 = Buffer.from(dataStr).toString("base64");
  const signature = crypto.createHmac("sha256", secret).update(dataB64).digest("hex");
  return `${dataB64}.${signature}`;
}

/** Verify a session token and extract the user ID. Returns userId or null. Checks expiration. */
export function verifySessionToken(token: string): string | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const dataB64 = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  try {
    const secret = getSessionSecret();
    const expected = crypto.createHmac("sha256", secret).update(dataB64).digest("hex");

    if (signature.length !== expected.length) return null;
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );

    if (!isValid) return null;

    // Decode and check expiration
    const dataStr = Buffer.from(dataB64, "base64").toString("utf-8");
    const data: SessionData = JSON.parse(dataStr);

    // Check if token is expired
    if (Date.now() > data.exp) {
      return null; // Token expired
    }

    return data.userId;
  } catch {
    return null;
  }
}

/** Get the authenticated user from session cookie. Returns user or null. */
export async function getAuthSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return null;

    const userId = verifySessionToken(sessionCookie);
    if (!userId) return null;

    // Lazy import to avoid circular dependency
    const { db } = await import("./db");
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

/** Return a 401 Unauthorized JSON response. */
export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

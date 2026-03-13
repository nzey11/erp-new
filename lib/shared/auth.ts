import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  resolveActiveMembershipForUser,
  MembershipResolutionError,
} from "@/lib/modules/auth/resolve-membership";
import { logger } from "@/lib/shared/logger";
import type { ErpRole } from "@/lib/generated/prisma/client";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set in environment variables");
  }
  return secret;
}

/**
 * Sign a user ID to create a tamper-proof session token.
 * Format: userId|expiresAt.hmacSignature
 * @param expiresInHours - token lifetime in hours (default 168 = 7 days)
 */
export function signSession(userId: string, expiresInHours: number = 24 * 7): string {
  const secret = getSessionSecret();
  const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;
  const payload = `${userId}|${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/** Verify a session token and extract the user ID. Returns userId or null. */
export function verifySessionToken(token: string): string | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const pipeIndex = payload.lastIndexOf("|");
  if (pipeIndex === -1) return null;

  const userId = payload.substring(0, pipeIndex);
  const expiresAt = Number(payload.substring(pipeIndex + 1));

  if (!userId || isNaN(expiresAt)) return null;

  // Check expiry
  if (Date.now() > expiresAt) return null;

  try {
    const secret = getSessionSecret();
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (signature.length !== expected.length) return null;
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );

    return isValid ? userId : null;
  } catch {
    return null;
  }
}

// ─── Tenant-Aware Session Types ───────────────────────────────────────────────

export interface TenantAwareSession {
  id: string;
  username: string;
  role: ErpRole; // From TenantMembership, not User
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  membershipId: string;
}

// ─── Session Retrieval ────────────────────────────────────────────────────────

/**
 * Get the authenticated user with tenant context from session cookie.
 *
 * Returns null silently for missing/invalid tokens (no logging).
 * Logs specific reasons for membership failures (for observability).
 *
 * @returns TenantAwareSession or null
 */
export async function getAuthSession(): Promise<TenantAwareSession | null> {
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
      select: { id: true, username: true, isActive: true },
    });

    // User not found or inactive
    if (!user) {
      logger.warn("auth/session", "User not found in database", { userId });
      return null;
    }

    if (!user.isActive) {
      logger.warn("auth/session", "User is inactive", { userId, username: user.username });
      return null;
    }

    // Resolve tenant membership
    try {
      const membership = await resolveActiveMembershipForUser(userId);

      return {
        id: user.id,
        username: user.username,
        role: membership.role,
        tenantId: membership.tenantId,
        tenantName: membership.tenantName,
        tenantSlug: membership.tenantSlug,
        membershipId: membership.membershipId,
      };
    } catch (error) {
      // Log specific membership resolution failures
      if (error instanceof MembershipResolutionError) {
        logger.warn("auth/session", `Membership resolution failed: ${error.code}`, {
          userId,
          username: user.username,
          code: error.code,
        });
      } else {
        logger.error("auth/session", "Unexpected error during membership resolution", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  } catch {
    return null;
  }
}

/** Return a 401 Unauthorized JSON response. */
export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

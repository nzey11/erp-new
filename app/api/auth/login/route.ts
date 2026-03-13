import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { signSession } from "@/lib/shared/auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { loginSchema } from "@/lib/shared/schemas/auth.schema";
import { logger } from "@/lib/shared/logger";
import { compare } from "bcryptjs";
import {
  resolveActiveMembershipForUser,
  MembershipResolutionError,
} from "@/lib/modules/auth/resolve-membership";
import { generateCsrfToken, signCsrfToken, CSRF_COOKIE_NAME } from "@/lib/shared/csrf";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await parseBody(request, loginSchema);

    logger.info("auth/login", "Login attempt", { username });

    // 1. Validate credentials
    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, isActive: true },
    });

    if (!user || !user.isActive) {
      logger.warn("auth/login", "Login failed: user not found or inactive", { username });
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    const isValid = await compare(password, user.password);
    if (!isValid) {
      logger.warn("auth/login", "Login failed: wrong password", { username });
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    // 2. Resolve tenant membership (v1: auto-select single active membership)
    let membership;
    try {
      membership = await resolveActiveMembershipForUser(user.id);
    } catch (error) {
      if (error instanceof MembershipResolutionError) {
        logger.warn("auth/login", `Membership resolution failed: ${error.code}`, {
          userId: user.id,
          username,
          code: error.code,
        });
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
      throw error;
    }

    // 3. Create session (token still simple: just userId)
    const token = signSession(user.id);

    // 4. Generate CSRF token for subsequent requests
    const csrfToken = generateCsrfToken();
    const signedCsrfToken = await signCsrfToken(
      csrfToken,
      process.env.SESSION_SECRET || "default-secret"
    );

    logger.info("auth/login", "Login successful", {
      username,
      userId: user.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenantName,
      role: membership.role,
    });

    // 4. Return tenant-aware user context (role from membership, not User)
    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: membership.role,
        tenantId: membership.tenantId,
        tenantName: membership.tenantName,
        tenantSlug: membership.tenantSlug,
      },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Set CSRF cookie (not httpOnly - needs to be readable by JS)
    response.cookies.set(CSRF_COOKIE_NAME, signedCsrfToken, {
      httpOnly: false,
      secure: process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("auth/login", "Unexpected server error during login", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

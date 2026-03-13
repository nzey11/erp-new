import { NextResponse } from "next/server";
import {
  generateCsrfToken,
  signCsrfToken,
  CSRF_COOKIE_NAME,
} from "@/lib/shared/csrf";

/**
 * GET /api/auth/csrf - Get CSRF token
 * Returns a new CSRF token set in both cookie and response body.
 * The client should include this token in the X-CSRF-Token header
 * for all mutating requests (POST, PUT, PATCH, DELETE).
 */
export async function GET() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const token = generateCsrfToken();
  const signedToken = await signCsrfToken(token, secret);

  const response = NextResponse.json({
    token,
    message: "Include this token in X-CSRF-Token header for mutating requests",
  });

  // Set CSRF cookie (HttpOnly for security)
  response.cookies.set(CSRF_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}

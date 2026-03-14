import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME } from "@/lib/shared/csrf";
import { SESSION_COOKIE_INVALIDATE_OPTIONS } from "@/lib/shared/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("session", "", SESSION_COOKIE_INVALIDATE_OPTIONS);
  response.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

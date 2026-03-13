import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME } from "@/lib/shared/csrf";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

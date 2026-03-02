import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME } from "@/lib/shared/customer-auth";

/** POST /api/auth/customer/logout — Logout customer */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CUSTOMER_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

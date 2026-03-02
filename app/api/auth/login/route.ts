import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { signSession } from "@/lib/shared/auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { loginSchema } from "@/lib/shared/schemas/auth.schema";
import { compare } from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/shared/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 attempts per minute per IP
    const clientIp = getClientIp(request);
    const rateLimitResult = rateLimit(`login:${clientIp}`, 5, 60 * 1000);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: "Слишком много попыток входа. Попробуйте позже.",
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(rateLimitResult.reset),
          }
        }
      );
    }

    const { username, password } = await parseBody(request, loginSchema);

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    const isValid = await compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    const token = signSession(user.id);
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES === "true",
      sameSite: "lax", // CSRF protection
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours (matches token expiration)
    });

    return response;
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

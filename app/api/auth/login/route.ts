import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { signSession } from "@/lib/shared/auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { loginSchema } from "@/lib/shared/schemas/auth.schema";
import { compare } from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting temporarily disabled due to Edge Runtime compatibility issues
    // TODO: Implement Redis-based rate limiting
    
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

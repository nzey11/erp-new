import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { signSession } from "@/lib/shared/auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { loginSchema } from "@/lib/shared/schemas/auth.schema";
import { logger } from "@/lib/shared/logger";
import { compare } from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await parseBody(request, loginSchema);

    logger.info("auth/login", "Login attempt", { username });

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, role: true, isActive: true },
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

    const token = signSession(user.id);
    logger.info("auth/login", "Login successful", { username, userId: user.id, role: user.role });

    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
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

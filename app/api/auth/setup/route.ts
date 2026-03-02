import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { parseBody, validationError } from "@/lib/shared/validation";
import { setupSchema } from "@/lib/shared/schemas/auth.schema";
import { hash } from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    // Only allow setup if no users exist
    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Настройка уже выполнена" },
        { status: 400 }
      );
    }

    const { username, password } = await parseBody(request, setupSchema);

    const passwordHash = await hash(password, 12);
    const user = await db.user.create({
      data: {
        username,
        password: passwordHash,
        role: "admin",
      },
    });

    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

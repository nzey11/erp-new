import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createUserSchema } from "@/lib/modules/accounting/schemas/users.schema";
import { hash } from "bcryptjs";
import type { ErpRole } from "@/lib/generated/prisma/client";

export async function GET() {
  try {
    await requirePermission("users:manage");

    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("users:manage");

    const data = await parseBody(request, createUserSchema);

    const existing = await db.user.findUnique({ where: { username: data.username } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким логином уже существует" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(data.password, 12);

    const user = await db.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        email: data.email || null,
        role: data.role as ErpRole,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

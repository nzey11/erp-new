import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createUserSchema } from "@/lib/modules/accounting/schemas/users.schema";
import { UserService } from "@/lib/modules/accounting";
import { hash } from "bcryptjs";
import type { ErpRole } from "@/lib/generated/prisma/client";

export async function GET() {
  try {
    await requirePermission("users:manage");
    const users = await UserService.list();
    return NextResponse.json(users);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission("users:manage");

    const data = await parseBody(request, createUserSchema);

    const existing = await UserService.findByUsername(data.username);
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким логином уже существует" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(data.password, 12);

    const user = await UserService.create({
      username: data.username,
      password: hashedPassword,
      email: data.email || null,
      role: data.role as ErpRole,
      tenantId: actor.tenantId, // Add new user to the same tenant as admin
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateUserSchema } from "@/lib/modules/accounting/schemas/users.schema";
import {
  assertUserCanBeDeactivated,
  assertUserCanBeDeleted,
  ProtectedUserError,
} from "@/lib/modules/accounting/services/user-lifecycle";
import {
  logUserLifecycleChange,
  buildAuditEvent,
} from "@/lib/modules/accounting/services/user-audit";
import { hash } from "bcryptjs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("users:manage");
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("users:manage");
    const { id } = await params;
    const data = await parseBody(request, updateUserSchema);

    // NOTE: isActive changes are handled via separate lifecycle endpoints
    // (POST /:id/activate and POST /:id/deactivate)

    const updateData: Record<string, unknown> = {};
    if (data.username !== undefined) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.role !== undefined) updateData.role = data.role;

    if (data.password) {
      updateData.password = await hash(data.password, 12);
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission("users:manage");
    const { id } = await params;

    // Get target user info before change for audit
    const targetUser = await db.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check protected user invariant
    try {
      await assertUserCanBeDeleted(id);
    } catch (err) {
      if (err instanceof ProtectedUserError) {
        // Log forbidden attempt
        logUserLifecycleChange(
          buildAuditEvent(
            "soft_delete",
            actor.id,
            targetUser,
            request,
            "forbidden",
            err.message
          )
        );
        const { error, status } = err.toResponse();
        return NextResponse.json({ error }, { status });
      }
      throw err;
    }

    // Deactivate rather than delete
    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Log successful soft delete
    logUserLifecycleChange(
      buildAuditEvent("soft_delete", actor.id, targetUser, request, "success")
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

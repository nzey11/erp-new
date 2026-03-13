// =============================================
// POST /api/accounting/users/:id/deactivate
// User lifecycle: Deactivation endpoint
// =============================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import {
  assertUserCanBeDeactivated,
  ProtectedUserError,
} from "@/lib/modules/accounting/services/user-lifecycle";
import {
  logUserLifecycleChange,
  buildAuditEvent,
} from "@/lib/modules/accounting/services/user-audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
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

    // Enforce protected user invariant
    try {
      await assertUserCanBeDeactivated(id);
    } catch (err) {
      if (err instanceof ProtectedUserError) {
        // Log forbidden attempt
        logUserLifecycleChange(
          buildAuditEvent(
            "deactivate",
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

    const user = await db.user.update({
      where: { id },
      data: { isActive: false },
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

    // Log successful deactivation
    logUserLifecycleChange(
      buildAuditEvent("deactivate", actor.id, targetUser, request, "success")
    );

    return NextResponse.json(user);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

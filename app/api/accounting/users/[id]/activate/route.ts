// =============================================
// POST /api/accounting/users/:id/activate
// User lifecycle: Activation endpoint
// =============================================

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { UserService } from "@/lib/modules/accounting";
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
    const targetUser = await UserService.findByIdForAudit(id);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Activation is always allowed (recovery path)
    // No protected user check needed - we want to be able to recover system users

    const user = await UserService.setActive(id, true);

    // Log successful activation
    logUserLifecycleChange(
      buildAuditEvent("activate", actor.id, targetUser, request, "success")
    );

    return NextResponse.json(user);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

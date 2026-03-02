import { NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

/** GET /api/accounting/integrations - List all integrations */
export async function GET() {
  try {
    await requirePermission("settings:write");

    const integrations = await db.integration.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(integrations);
  } catch (error) {
    return handleAuthError(error);
  }
}

import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { IntegrationService } from "@/lib/modules/accounting";

/** GET /api/accounting/integrations - List all integrations */
export async function GET() {
  try {
    await requirePermission("settings:write");
    const integrations = await IntegrationService.listAll();
    return NextResponse.json(integrations);
  } catch (error) {
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAccounts } from "@/lib/modules/accounting/accounts";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const accounts = await getAccounts(includeInactive);
    return NextResponse.json(accounts);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

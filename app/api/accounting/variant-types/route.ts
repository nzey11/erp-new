import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantTypeSchema } from "@/lib/modules/accounting/schemas/variant-types.schema";
import { VariantTypeService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    await requirePermission("products:read");
    const types = await VariantTypeService.list();
    return NextResponse.json(types);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");
    const data = await parseBody(request, createVariantTypeSchema);
    const variantType = await VariantTypeService.create({ name: data.name });
    return NextResponse.json(variantType, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

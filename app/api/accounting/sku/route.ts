import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { generateSkuSchema } from "@/lib/modules/accounting/schemas/reports.schema";
import { ProductService } from "@/lib/modules/accounting";

/** Generate next SKU: SKU-000001, SKU-000002, etc. */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, generateSkuSchema);
    const sku = await ProductService.generateSku(data.prefix);

    return NextResponse.json({ sku });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

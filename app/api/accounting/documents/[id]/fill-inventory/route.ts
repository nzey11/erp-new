import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { DocumentService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/accounting/documents/[id]/fill-inventory
 *
 * Fills an inventory_count document with current stock data.
 * Sets expectedQty = current stock quantity for each product on the warehouse.
 * Only works on draft inventory_count documents.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:write");
    const { id } = await params;

    const result = await DocumentService.fillInventory(id);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.document);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

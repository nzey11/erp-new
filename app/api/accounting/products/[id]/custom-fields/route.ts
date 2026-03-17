import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateCustomFieldValuesSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { ProductService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const fields = await ProductService.listCustomFields(productId);

    return NextResponse.json(fields);
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Bulk upsert custom fields for a product */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id: productId } = await params;
    const data = await parseBody(request, updateCustomFieldValuesSchema);
    const { fields } = data;

    const results = await ProductService.upsertCustomFields(productId, fields);
    if (!results) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    return NextResponse.json(results);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

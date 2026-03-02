import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateCustomFieldValuesSchema } from "@/lib/modules/accounting/schemas/products.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const fields = await db.productCustomField.findMany({
      where: { productId },
      include: { definition: true },
      orderBy: { definition: { order: "asc" } },
    });

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

    // Check product exists
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Upsert each field value
    const results = await Promise.all(
      fields.map((f) =>
        db.productCustomField.upsert({
          where: {
            productId_definitionId: {
              productId,
              definitionId: f.definitionId,
            },
          },
          create: {
            productId,
            definitionId: f.definitionId,
            value: String(f.value),
          },
          update: { value: String(f.value) },
          include: { definition: true },
        })
      )
    );

    return NextResponse.json(results);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

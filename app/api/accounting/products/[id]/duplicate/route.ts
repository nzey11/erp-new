import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { ProductService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("products:write");
    const { id } = await params;

    // Fetch the source product with relations to copy
    const source = await ProductService.findProductForDuplicate(id);

    if (!source) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Verify source product belongs to user's tenant
    if (source.tenantId && source.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Create the duplicated product
    const duplicated = await ProductService.duplicateProduct(source, session.tenantId);

    return NextResponse.json({
      ...duplicated,
      purchasePrice: duplicated.purchasePrices[0]?.price ?? null,
      salePrice: duplicated.salePrices[0]?.price ?? null,
      discountedPrice: null,
      discountValidTo: null,
      discountName: null,
      variantCount: 0,
    }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { ProductService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const variants = await ProductService.listVariants(productId);

    return NextResponse.json(variants);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id: productId } = await params;
    const data = await parseBody(request, createVariantSchema);
    const { optionId, sku, barcode, priceAdjustment } = data;

    // Check product exists
    const product = await ProductService.findProductForVariant(productId);
    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const variant = await ProductService.createVariant({
      productId,
      optionId,
      tenantId: product.tenantId,
      sku: sku || null,
      barcode: barcode || null,
      priceAdjustment: priceAdjustment ?? 0,
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    await params;

    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");

    if (!variantId) {
      return NextResponse.json({ error: "variantId обязателен" }, { status: 400 });
    }

    await ProductService.deactivateVariant(variantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantLinkSchema } from "@/lib/modules/accounting/schemas/products.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const links = await db.productVariantLink.findMany({
      where: { productId, isActive: true },
      include: {
        linkedProduct: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            salePrices: {
              where: { isActive: true },
              orderBy: { validFrom: "desc" },
              take: 1,
              select: { price: true },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const result = links.map((l) => ({
      id: l.id,
      linkedProductId: l.linkedProductId,
      groupName: l.groupName,
      sortOrder: l.sortOrder,
      linkedProduct: {
        id: l.linkedProduct.id,
        name: l.linkedProduct.name,
        sku: l.linkedProduct.sku,
        imageUrl: l.linkedProduct.imageUrl,
        salePrice: l.linkedProduct.salePrices[0]?.price ?? null,
      },
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id: productId } = await params;
    const data = await parseBody(request, createVariantLinkSchema);
    const { linkedProductId, groupName } = data;

    if (linkedProductId === productId) {
      return NextResponse.json(
        { error: "Нельзя связать товар с самим собой" },
        { status: 400 }
      );
    }

    const linkedProduct = await db.product.findUnique({
      where: { id: linkedProductId },
      select: {
        id: true,
        name: true,
        sku: true,
        imageUrl: true,
        salePrices: {
          where: { isActive: true },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { price: true },
        },
      },
    });

    if (!linkedProduct) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Check if link already exists
    const existingLink = await db.productVariantLink.findFirst({
      where: { productId, linkedProductId },
    });

    if (existingLink) {
      // Reactivate if soft-deleted, otherwise return existing
      if (!existingLink.isActive) {
        await db.productVariantLink.update({
          where: { id: existingLink.id },
          data: { isActive: true, groupName: groupName || existingLink.groupName },
        });
        // Also set masterProductId on the linked product
        await db.product.update({
          where: { id: linkedProductId },
          data: { masterProductId: productId },
        });
      }
      return NextResponse.json({
        id: existingLink.id,
        linkedProductId: existingLink.linkedProductId,
        groupName: groupName || existingLink.groupName,
        sortOrder: existingLink.sortOrder,
        linkedProduct: {
          id: linkedProduct.id,
          name: linkedProduct.name,
          sku: linkedProduct.sku,
          imageUrl: linkedProduct.imageUrl,
          salePrice: linkedProduct.salePrices[0]?.price ?? null,
        },
      }, { status: 200 });
    }

    const link = await db.productVariantLink.create({
      data: { productId, linkedProductId, groupName: groupName || "Модификации" },
    });

    // Also set masterProductId on the linked product for variant hierarchy
    await db.product.update({
      where: { id: linkedProductId },
      data: { masterProductId: productId },
    });

    return NextResponse.json({
      id: link.id,
      linkedProductId: link.linkedProductId,
      groupName: link.groupName,
      sortOrder: link.sortOrder,
      linkedProduct: {
        id: linkedProduct.id,
        name: linkedProduct.name,
        sku: linkedProduct.sku,
        imageUrl: linkedProduct.imageUrl,
        salePrice: linkedProduct.salePrices[0]?.price ?? null,
      },
    }, { status: 201 });
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
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    // Get the link to find the linkedProductId
    const link = await db.productVariantLink.findUnique({
      where: { id: linkId },
      select: { linkedProductId: true },
    });

    await db.productVariantLink.update({
      where: { id: linkId },
      data: { isActive: false },
    });

    // Clear masterProductId on the linked product
    if (link) {
      await db.product.update({
        where: { id: link.linkedProductId },
        data: { masterProductId: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

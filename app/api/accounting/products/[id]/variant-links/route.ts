import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createVariantLinkSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";
import { ProductService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id: productId } = await params;

    const links = await ProductService.listVariantLinks(productId);

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

    const linkedProduct = await ProductService.findLinkedProduct(linkedProductId);

    if (!linkedProduct) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Check if link already exists
    const existingLink = await ProductService.findVariantLink(productId, linkedProductId);

    if (existingLink) {
      // Reactivate if soft-deleted, otherwise return existing
      if (!existingLink.isActive) {
        await ProductService.$transaction(async (tx) => {
          await ProductService.reactivateVariantLink(
            existingLink.id,
            { groupName: groupName || existingLink.groupName },
            productId,
            linkedProductId,
            tx
          );
          // Both affected products need projection update
          await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId } }, "Product", productId);
          await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId: linkedProductId } }, "Product", linkedProductId);
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

    const link = await ProductService.$transaction(async (tx) => {
      const created = await ProductService.createVariantLink(
        productId,
        linkedProductId,
        groupName || "Модификации",
        tx
      );
      // Both master and variant need projection update
      await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId } }, "Product", productId);
      await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId: linkedProductId } }, "Product", linkedProductId);
      return created;
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
    const { id: productId } = await params;

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    // Get the link to find the linkedProductId
    const link = await ProductService.findVariantLinkById(linkId);

    await ProductService.$transaction(async (tx) => {
      await ProductService.deactivateVariantLink(linkId, link?.linkedProductId, productId, tx);

      // Both products affected — emit events
      if (link) {
        await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId } }, "Product", productId);
        await createOutboxEvent(tx, { type: "product.updated", occurredAt: new Date(), payload: { productId: link.linkedProductId } }, "Product", link.linkedProductId);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

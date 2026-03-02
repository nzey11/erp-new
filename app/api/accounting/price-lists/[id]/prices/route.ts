import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { addPriceListPriceSchema } from "@/lib/modules/accounting/schemas/prices.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:read");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const priceList = await db.priceList.findUnique({ where: { id } });
    if (!priceList) {
      return NextResponse.json({ error: "Прайс-лист не найден" }, { status: 404 });
    }

    const prices = await db.salePrice.findMany({
      where: {
        priceListId: id,
        isActive: true,
        ...(search && {
          product: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          },
        }),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            unit: { select: { shortName: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    return NextResponse.json({ priceList, prices });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;

    const data = await parseBody(request, addPriceListPriceSchema);

    // Check if price list exists
    const priceList = await db.priceList.findUnique({ where: { id } });
    if (!priceList) {
      return NextResponse.json({ error: "Прайс-лист не найден" }, { status: 404 });
    }

    // Check if product exists
    const product = await db.product.findUnique({ where: { id: data.productId } });
    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Check for existing active price for this product in this price list
    const existingPrice = await db.salePrice.findFirst({
      where: {
        priceListId: id,
        productId: data.productId,
        isActive: true,
      },
    });

    if (existingPrice) {
      // Update existing price
      const updated = await db.salePrice.update({
        where: { id: existingPrice.id },
        data: {
          price: data.price,
          validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
          validTo: data.validTo ? new Date(data.validTo) : null,
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, imageUrl: true },
          },
        },
      });
      return NextResponse.json(updated);
    }

    // Create new price
    const price = await db.salePrice.create({
      data: {
        productId: data.productId,
        priceListId: id,
        price: data.price,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, imageUrl: true },
        },
      },
    });

    return NextResponse.json(price, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("pricing:write");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const priceId = searchParams.get("priceId");

    if (!priceId) {
      return NextResponse.json({ error: "ID цены обязателен" }, { status: 400 });
    }

    // Soft delete
    await db.salePrice.update({
      where: { id: priceId, priceListId: id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

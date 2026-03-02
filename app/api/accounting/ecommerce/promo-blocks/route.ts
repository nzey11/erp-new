import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createPromoBlockSchema, updatePromoBlockSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";

export async function GET() {
  try {
    await requirePermission("products:read");

    const promoBlocks = await db.promoBlock.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(promoBlocks);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, createPromoBlockSchema);

    const promoBlock = await db.promoBlock.create({
      data: {
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        linkUrl: data.linkUrl || null,
        order: data.order,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(promoBlock, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID обязателен" },
        { status: 400 }
      );
    }

    const data = await parseBody(request, updatePromoBlockSchema);

    const promoBlock = await db.promoBlock.update({
      where: { id },
      data: {
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        linkUrl: data.linkUrl || null,
        order: data.order,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(promoBlock);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID обязателен" },
        { status: 400 }
      );
    }

    await db.promoBlock.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

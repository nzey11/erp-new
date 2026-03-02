import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateReviewSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";

export async function GET() {
  try {
    await requirePermission("products:read");

    const reviews = await db.review.findMany({
      include: {
        product: {
          select: {
            name: true,
            sku: true,
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
            telegramUsername: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(reviews);
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

    const data = await parseBody(request, updateReviewSchema);

    const review = await db.review.update({
      where: { id },
      data: { isPublished: data.isPublished },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
            telegramUsername: true,
          },
        },
      },
    });

    return NextResponse.json(review);
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

    await db.review.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

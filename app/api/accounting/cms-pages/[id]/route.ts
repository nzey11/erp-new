import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateStorePageSchema } from "@/lib/modules/ecommerce";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:read");

    const { id } = await params;
    const page = await db.storePage.findUnique({ where: { id } });

    if (!page) {
      return NextResponse.json(
        { error: "Страница не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json(page);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:write");

    const { id } = await params;
    const data = await parseBody(request, updateStorePageSchema);

    // If slug is being changed, check uniqueness
    if (data.slug) {
      const existing = await db.storePage.findFirst({
        where: { slug: data.slug, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Страница с таким slug уже существует" },
          { status: 409 }
        );
      }
    }

    const page = await db.storePage.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.seoTitle !== undefined && { seoTitle: data.seoTitle || null }),
        ...(data.seoDescription !== undefined && { seoDescription: data.seoDescription || null }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.showInFooter !== undefined && { showInFooter: data.showInFooter }),
        ...(data.showInHeader !== undefined && { showInHeader: data.showInHeader }),
      },
    });

    return NextResponse.json(page);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:write");

    const { id } = await params;

    await db.storePage.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

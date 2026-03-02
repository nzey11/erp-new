import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createStorePageSchema } from "@/lib/modules/ecommerce";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const pages = await db.storePage.findMany({
      where: search
        ? { title: { contains: search, mode: "insensitive" } }
        : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ data: pages });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, createStorePageSchema);

    // Check slug uniqueness
    const existing = await db.storePage.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Страница с таким slug уже существует" },
        { status: 409 }
      );
    }

    const page = await db.storePage.create({
      data: {
        title: data.title,
        slug: data.slug,
        content: data.content,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        isPublished: data.isPublished,
        sortOrder: data.sortOrder,
        showInFooter: data.showInFooter,
        showInHeader: data.showInHeader,
      },
    });

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

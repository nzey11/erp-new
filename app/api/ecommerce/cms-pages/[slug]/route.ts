import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const page = await db.storePage.findUnique({
      where: { slug, isPublished: true },
    });

    if (!page) {
      return NextResponse.json(
        { error: "Страница не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: page.id,
      title: page.title,
      slug: page.slug,
      content: page.content,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
    });
  } catch (error) {
    console.error("Failed to fetch CMS page:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить страницу" },
      { status: 500 }
    );
  }
}

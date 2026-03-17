import { NextRequest, NextResponse } from "next/server";
import { StorefrontCmsService } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const page = await StorefrontCmsService.findBySlug(slug);

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
    logger.error("cms-pages", "Failed to fetch CMS page", error);
    return NextResponse.json(
      { error: "Не удалось загрузить страницу" },
      { status: 500 }
    );
  }
}

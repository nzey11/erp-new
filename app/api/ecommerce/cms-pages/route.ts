import { NextRequest, NextResponse } from "next/server";
import { StorefrontCmsService } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showInFooter = searchParams.get("showInFooter");
    const showInHeader = searchParams.get("showInHeader");

    const pages = await StorefrontCmsService.listPublished({
      showInFooter: showInFooter === "true",
      showInHeader: showInHeader === "true",
    });

    return NextResponse.json({ data: pages });
  } catch (error) {
    logger.error("cms-pages", "Failed to fetch CMS pages", error);
    return NextResponse.json(
      { error: "Не удалось загрузить страницы" },
      { status: 500 }
    );
  }
}

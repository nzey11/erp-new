import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showInFooter = searchParams.get("showInFooter");
    const showInHeader = searchParams.get("showInHeader");

    const where: Record<string, unknown> = { isPublished: true };
    if (showInFooter === "true") where.showInFooter = true;
    if (showInHeader === "true") where.showInHeader = true;

    const pages = await db.storePage.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        sortOrder: true,
        showInFooter: true,
        showInHeader: true,
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    return NextResponse.json({ data: pages });
  } catch (error) {
    console.error("Failed to fetch CMS pages:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить страницы" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { validationError } from "@/lib/shared/validation";

/** GET /api/ecommerce/categories — Public category tree */
export async function GET() {
  try {
    const categories = await db.productCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          select: { id: true, name: true, parentId: true, order: true },
        },
        _count: {
          select: {
            products: {
              where: { isActive: true, publishedToStore: true },
            },
          },
        },
      },
    });

    // Return only root categories (parentId is null) with children
    const rootCategories = categories
      .filter((c) => !c.parentId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        productCount: c._count.products,
        children: c.children.map((ch) => ({
          id: ch.id,
          name: ch.name,
        })),
      }));

    return NextResponse.json({ data: rootCategories });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Ecommerce categories error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

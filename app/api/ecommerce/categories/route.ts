import { NextResponse } from "next/server";
import { validationError } from "@/lib/shared/validation";
import { StorefrontCategoryService } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";

/** GET /api/ecommerce/categories — Public category tree */
export async function GET() {
  try {
    const categories = await StorefrontCategoryService.listPublished();

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
    logger.error("ecommerce-categories", "Failed to fetch categories", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

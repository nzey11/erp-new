import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { z } from "zod";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { VariantGroupService, toNumber } from "@/lib/modules/accounting";

const queryVariantGroupsSchema = z.object({
  search: z.string().optional().default(""),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

/** GET /api/accounting/variants/groups — List all variant groups */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");

    const { search, categoryId, page = 1, limit = 20 } = parseQuery(request, queryVariantGroupsSchema);

    const { masterProducts, total } = await VariantGroupService.list({ search, categoryId, page, limit });

    // Transform to variant groups format
    const groups = masterProducts.map((master) => {
      const masterPrice = toNumber(master.salePrices[0]?.price);
      const variantPrices = master.childVariants
        .map((v) => toNumber(v.salePrices[0]?.price))
        .filter((p) => p > 0);
      const allPrices = [masterPrice, ...variantPrices].filter((p) => p > 0);

      const masterStock = master.stockRecords.reduce((sum, r) => sum + r.quantity, 0);
      const variantStock = master.childVariants.reduce(
        (sum, v) => sum + v.stockRecords.reduce((s, r) => s + r.quantity, 0),
        0
      );

      const publishedCount = master.childVariants.filter((v) => v.publishedToStore).length;

      return {
        id: master.id,
        name: master.name,
        sku: master.sku,
        imageUrl: master.imageUrl,
        variantGroupName: master.variantGroupName,
        category: master.category,
        totalVariants: master.childVariants.length,
        publishedVariants: publishedCount,
        priceRange: allPrices.length > 1
          ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
          : null,
        totalStock: masterStock + variantStock,
        variants: master.childVariants.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          imageUrl: v.imageUrl,
          publishedToStore: v.publishedToStore,
          salePrice: toNumber(v.salePrices[0]?.price) || null,
          stock: v.stockRecords.reduce((sum, r) => sum + r.quantity, 0),
        })),
      };
    });

    return NextResponse.json({ data: groups, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

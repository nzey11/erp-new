import { NextResponse } from "next/server";
import { validationError } from "@/lib/shared/validation";
import { EcommerceAdminService } from "@/lib/modules/accounting";
import { logger } from "@/lib/shared/logger";

/** GET /api/ecommerce/promo-blocks — Active promo blocks */
export async function GET() {
  try {
    const promos = await EcommerceAdminService.getActivePromoBlocks();
    return NextResponse.json(promos);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("promo-blocks", "Failed to fetch promo blocks", error);
    return NextResponse.json({ error: "Failed to fetch promo blocks" }, { status: 500 });
  }
}

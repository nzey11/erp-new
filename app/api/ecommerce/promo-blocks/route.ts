import { NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { validationError } from "@/lib/shared/validation";
import { logger } from "@/lib/shared/logger";

/** GET /api/ecommerce/promo-blocks — Active promo blocks */
export async function GET() {
  try {
    const promos = await db.promoBlock.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(promos);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("promo-blocks", "Failed to fetch promo blocks", error);
    return NextResponse.json({ error: "Failed to fetch promo blocks" }, { status: 500 });
  }
}

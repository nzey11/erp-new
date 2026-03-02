import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { generateSkuSchema } from "@/lib/modules/accounting/schemas/reports.schema";

/** Generate next SKU: SKU-000001, SKU-000002, etc. */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, generateSkuSchema);

    // Upsert counter and atomically increment
    const counter = await db.skuCounter.upsert({
      where: { prefix: data.prefix },
      create: { prefix: data.prefix, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    const sku = `${data.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;

    return NextResponse.json({ sku });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { findVariantSuggestions } from "@/lib/modules/accounting/variant-matcher";
import { z } from "zod";
import { parseQuery, validationError } from "@/lib/shared/validation";

const querySuggestionsSchema = z.object({
  strategy: z.enum(["all", "sku", "name", "characteristics"]).default("all"),
  minConfidence: z.coerce.number().int().min(0).max(100).default(50),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

/** GET /api/accounting/products/[id]/suggestions — Get variant suggestions for a product */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:read");

    const { id } = await params;
    const { strategy, minConfidence, limit } = parseQuery(request, querySuggestionsSchema);

    const suggestions = await findVariantSuggestions(id, {
      strategy,
      minConfidence,
      limit,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

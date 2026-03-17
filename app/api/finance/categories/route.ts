import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/authorization";
import { z } from "zod";
import { PaymentService } from "@/lib/modules/finance";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  defaultAccountCode: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const categories = await PaymentService.listFinanceCategories(type);

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const data = createCategorySchema.parse(body);

    const category = await PaymentService.createFinanceCategory(data);

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

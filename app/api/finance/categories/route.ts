import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth } from "@/lib/shared/authorization";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const categories = await db.financeCategory.findMany({
      where: {
        isActive: true,
        ...(type ? { type } : {}),
      },
      orderBy: [{ type: "asc" }, { order: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const data = createCategorySchema.parse(body);

    // Get max order for this type
    const maxOrder = await db.financeCategory.aggregate({
      where: { type: data.type },
      _max: { order: true },
    });

    const category = await db.financeCategory.create({
      data: {
        ...data,
        isSystem: false,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

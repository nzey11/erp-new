import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createCategorySchema } from "@/lib/modules/accounting/schemas/categories.schema";

export async function GET() {
  try {
    await requirePermission("categories:read");

    const categories = await db.productCategory.findMany({
      where: { isActive: true },
      include: { children: { where: { isActive: true }, orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    // Return flat list; clients can build the tree from parentId
    return NextResponse.json(categories);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("categories:write");

    const data = await parseBody(request, createCategorySchema);

    const category = await db.productCategory.create({
      data: { name: data.name, parentId: data.parentId || null, order: data.order },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

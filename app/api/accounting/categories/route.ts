import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createCategorySchema } from "@/lib/modules/accounting/schemas/categories.schema";
import { CategoryService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    await requirePermission("categories:read");
    const categories = await CategoryService.list();
    return NextResponse.json(categories);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("categories:write");
    const data = await parseBody(request, createCategorySchema);
    const category = await CategoryService.create({ name: data.name, parentId: data.parentId || null, order: data.order });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateReviewSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";
import { EcommerceAdminService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    await requirePermission("products:read");
    const reviews = await EcommerceAdminService.listReviews();
    return NextResponse.json(reviews);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID обязателен" },
        { status: 400 }
      );
    }

    const data = await parseBody(request, updateReviewSchema);
    const review = await EcommerceAdminService.updateReview(id, data.isPublished);
    return NextResponse.json(review);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID обязателен" },
        { status: 400 }
      );
    }

    await EcommerceAdminService.deleteReview(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createReviewSchema } from "@/lib/modules/ecommerce/schemas/reviews.schema";

/** POST /api/ecommerce/reviews — Submit product review */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { productId, rating, title, comment, orderId } = await parseBody(
      request,
      createReviewSchema
    );

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, publishedToStore: true },
    });

    if (!product || !product.isActive || !product.publishedToStore) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if customer already reviewed this product
    const existingReview = await db.review.findFirst({
      where: {
        productId,
        customerId: customer.id,
      },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: "You have already reviewed this product" },
        { status: 400 }
      );
    }

    // Check for verified purchase
    let isVerifiedPurchase = false;
    if (orderId) {
      // Check in Document (sales_order) - new approach
      const doc = await db.document.findFirst({
        where: {
          id: orderId,
          type: "sales_order",
          customerId: customer.id,
          status: { in: ["confirmed", "shipped", "delivered"] },
          items: { some: { productId } },
        },
      });
      if (doc) isVerifiedPurchase = true;
    }

    // Create review (not published by default, admin approval needed)
    const review = await db.review.create({
      data: {
        productId,
        customerId: customer.id,
        documentId: orderId || null,  // orderId now maps to documentId
        rating,
        title: title || null,
        comment: comment || null,
        isVerifiedPurchase,
        isPublished: false,
      },
    });

    return NextResponse.json({
      review: {
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isVerifiedPurchase: review.isVerifiedPurchase,
        isPublished: review.isPublished,
      },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

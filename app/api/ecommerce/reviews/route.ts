import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createReviewSchema } from "@/lib/modules/ecommerce/schemas/reviews.schema";
import { ReviewService } from "@/lib/modules/ecommerce";

/** POST /api/ecommerce/reviews — Submit product review */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { productId, rating, title, comment, orderId } = await parseBody(
      request,
      createReviewSchema
    );

    // Verify product exists
    const product = await ReviewService.findProduct(productId);

    if (!product || !product.isActive || !product.publishedToStore) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if customer already reviewed this product
    const existingReview = await ReviewService.findExistingReview(productId, customer.id);

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
      const doc = await ReviewService.findVerifiedPurchase(orderId, productId, customer.id);
      if (doc) isVerifiedPurchase = true;
    }

    // Create review (not published by default, admin approval needed)
    const review = await ReviewService.create({
      productId,
      customerId: customer.id,
      documentId: orderId || null,  // orderId now maps to documentId
      rating,
      title: title || null,
      comment: comment || null,
      isVerifiedPurchase,
      isPublished: false,
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

-- Migration: Add imageUrls to Product
-- Description: JSON array field for multiple product images

-- Step 1: Add imageUrls column
ALTER TABLE "Product" ADD COLUMN "imageUrls" JSONB DEFAULT '[]';

-- Step 2: Populate imageUrls from existing imageUrl
UPDATE "Product"
SET "imageUrls" = CASE
  WHEN "imageUrl" IS NOT NULL AND "imageUrl" != '' THEN jsonb_build_array("imageUrl")
  ELSE '[]'::jsonb
END;

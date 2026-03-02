-- Migration: Add Variant Hierarchy
-- Description: Adds masterProductId, isMainInGroup, variantGroupName fields to Product model
-- for e-commerce catalog variant grouping

-- Step 1: Add new columns to Product table
ALTER TABLE "Product" ADD COLUMN "masterProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN "isMainInGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "variantGroupName" TEXT;

-- Step 2: Add foreign key constraint for self-reference
ALTER TABLE "Product" ADD CONSTRAINT "Product_masterProductId_fkey" 
  FOREIGN KEY ("masterProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: Create indexes for efficient queries
CREATE INDEX "Product_masterProductId_idx" ON "Product"("masterProductId");
CREATE INDEX "Product_variantGroupName_idx" ON "Product"("variantGroupName");

-- Step 4: Auto-convert existing ProductVariantLink to masterProductId
-- The product in `linkedProductId` becomes a variant of `productId` (which becomes master)
UPDATE "Product" p
SET "masterProductId" = pvl."productId"
FROM "ProductVariantLink" pvl
WHERE p.id = pvl."linkedProductId" 
  AND pvl."isActive" = true
  AND p."masterProductId" IS NULL;

-- Step 5: Set isMainInGroup=true for master products that have variants
UPDATE "Product" p
SET "isMainInGroup" = true
WHERE EXISTS (
  SELECT 1 FROM "Product" child 
  WHERE child."masterProductId" = p.id
);

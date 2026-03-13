-- Add isReversing and reversesDocumentId columns to StockMovement
ALTER TABLE "StockMovement" ADD COLUMN "isReversing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StockMovement" ADD COLUMN "reversesDocumentId" TEXT;

-- Create index for isReversing
CREATE INDEX "StockMovement_isReversing_idx" ON "StockMovement"("isReversing");

-- Drop old unique indexes
DROP INDEX IF EXISTS "StockMovement_unique_no_variant_idx";
DROP INDEX IF EXISTS "StockMovement_unique_with_variant_idx";

-- Recreate unique indexes with isReversing included
-- One movement per (document, product, warehouse, type, isReversing) - without variant
CREATE UNIQUE INDEX "StockMovement_unique_no_variant_idx" 
    ON "StockMovement"("documentId", "productId", "warehouseId", "type", "isReversing")
    WHERE "variantId" IS NULL;

-- One movement per (document, product, warehouse, type, variant, isReversing) - with variant
CREATE UNIQUE INDEX "StockMovement_unique_with_variant_idx" 
    ON "StockMovement"("documentId", "productId", "warehouseId", "type", "variantId", "isReversing")
    WHERE "variantId" IS NOT NULL;

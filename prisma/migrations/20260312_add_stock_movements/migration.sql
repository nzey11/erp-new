-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('receipt', 'write_off', 'shipment', 'return', 'transfer_out', 'transfer_in', 'adjustment');

-- Add adjustmentsCreated to Document (for inventory_count idempotency)
ALTER TABLE "Document" ADD COLUMN "adjustmentsCreated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "type" "MovementType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Standard query indexes
CREATE INDEX "StockMovement_documentId_idx" ON "StockMovement"("documentId");
CREATE INDEX "StockMovement_productId_warehouseId_idx" ON "StockMovement"("productId", "warehouseId");
CREATE INDEX "StockMovement_warehouseId_createdAt_idx" ON "StockMovement"("warehouseId", "createdAt");
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex: Idempotency guarantees for StockMovement
-- One movement per (document, product, warehouse, type) - without variant
CREATE UNIQUE INDEX "StockMovement_unique_no_variant_idx" 
    ON "StockMovement"("documentId", "productId", "warehouseId", "type")
    WHERE "variantId" IS NULL;

-- One movement per (document, product, warehouse, type, variant) - with variant
CREATE UNIQUE INDEX "StockMovement_unique_with_variant_idx" 
    ON "StockMovement"("documentId", "productId", "warehouseId", "type", "variantId")
    WHERE "variantId" IS NOT NULL;

-- CreateIndex: Idempotency guarantees for inventory adjustments
-- One write_off per inventory_count
CREATE UNIQUE INDEX "Document_one_write_off_per_inventory_idx"
    ON "Document"("linkedDocumentId")
    WHERE "type" = 'write_off';

-- One stock_receipt per inventory_count
CREATE UNIQUE INDEX "Document_one_stock_receipt_per_inventory_idx"
    ON "Document"("linkedDocumentId")
    WHERE "type" = 'stock_receipt';

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,sku]` on the table `ProductVariant` will be added. If there are existing duplicate values, this will fail.
  - Made the column `tenantId` on table `Document` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_tenantId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Document_one_stock_receipt_per_inventory_idx";

-- DropIndex
DROP INDEX IF EXISTS "Document_one_write_off_per_inventory_idx";

-- DropIndex
DROP INDEX IF EXISTS "Product_tenantId_sku_key";

-- DropIndex
DROP INDEX IF EXISTS "ProductVariant_tenantId_sku_key";

-- DropIndex
DROP INDEX IF EXISTS "StockMovement_unique_no_variant_idx";

-- DropIndex
DROP INDEX IF EXISTS "StockMovement_unique_with_variant_idx";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProductVariant" ALTER COLUMN "tenantId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_tenantId_sku_key" ON "ProductVariant"("tenantId", "sku");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- R2-03: Provenance restoration migration for Product.tenantId
-- 
-- Context: Product.tenantId was introduced during the db push era and lacks
-- migration provenance. This migration documents the historical addition
-- of the tenantId column to the Product table.
--
-- Safety: This migration uses idempotent SQL that is safe for databases
-- where the column already exists. It will not fail if run against an
-- already-correct schema.

-- Add tenantId column to Product table (idempotent - safe if already exists)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Add foreign key constraint to Tenant table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Product_tenantId_fkey' 
        AND conrelid = '"Product"'::regclass
    ) THEN
        ALTER TABLE "Product" 
        ADD CONSTRAINT "Product_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add index for tenantId (idempotent)
CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");

-- Add composite unique index for tenant-scoped SKU (idempotent)
-- This supports the @@unique([tenantId, sku]) constraint in schema
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_sku_key" 
ON "Product"("tenantId", "sku") 
WHERE "sku" IS NOT NULL;

-- Add composite index for tenant + isActive queries (idempotent)
CREATE INDEX IF NOT EXISTS "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- Add composite index for tenant + category queries (idempotent)
CREATE INDEX IF NOT EXISTS "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

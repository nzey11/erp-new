-- Add tenantId column as nullable first
ALTER TABLE "Warehouse" ADD COLUMN "tenantId" TEXT;

-- Set default tenant for existing warehouses
UPDATE "Warehouse" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;

-- Make tenantId required
ALTER TABLE "Warehouse" ALTER COLUMN "tenantId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index
CREATE INDEX "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");

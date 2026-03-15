-- R2-04: Provenance restoration migration for Document.tenantId
-- 
-- Context: Document.tenantId was introduced during the db push era and lacks
-- migration provenance. This migration documents the historical addition
-- of the tenantId column to the Document table.
--
-- Safety: This migration uses idempotent SQL that is safe for databases
-- where the column already exists. It will not fail if run against an
-- already-correct schema.

-- Add tenantId column to Document table (idempotent - safe if already exists)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Add foreign key constraint to Tenant table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Document_tenantId_fkey' 
        AND conrelid = '"Document"'::regclass
    ) THEN
        ALTER TABLE "Document" 
        ADD CONSTRAINT "Document_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add index for tenantId (idempotent)
CREATE INDEX IF NOT EXISTS "Document_tenantId_idx" ON "Document"("tenantId");

-- Add composite index for tenant + type + status + date queries (idempotent)
CREATE INDEX IF NOT EXISTS "Document_tenantId_type_status_date_idx" 
ON "Document"("tenantId", "type", "status", "date");

-- Add composite index for tenant + counterparty queries (idempotent)
CREATE INDEX IF NOT EXISTS "Document_tenantId_counterpartyId_idx" 
ON "Document"("tenantId", "counterpartyId");

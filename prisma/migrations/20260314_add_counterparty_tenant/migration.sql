-- P4-09: Add tenantId to Counterparty table.
-- Phase 1 (this migration): Add nullable tenantId + FK + index.
-- Phase 2: After backfill (scripts/backfill-counterparty-tenant.ts), apply NOT NULL constraint
--          via migration 20260314_add_counterparty_tenant_not_null.
--
-- Safe: Adding a nullable column with FK is non-blocking on PostgreSQL.
-- Existing rows will have tenantId = NULL until backfill runs.
-- NOT NULL will be added only after 100% backfill is verified.

ALTER TABLE "Counterparty" ADD COLUMN "tenantId" TEXT;

ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Counterparty_tenantId_idx" ON "Counterparty"("tenantId");

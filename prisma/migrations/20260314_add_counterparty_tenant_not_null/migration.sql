-- P4-09: Enforce NOT NULL on Counterparty.tenantId
-- Phase 2: After backfill confirmed by verify-counterparty-tenant-gate.ts (all gates passed).

-- All rows now have a valid tenantId — safe to add NOT NULL constraint.
ALTER TABLE "Counterparty" ALTER COLUMN "tenantId" SET NOT NULL;

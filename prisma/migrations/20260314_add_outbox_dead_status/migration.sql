-- P2-07: Add DEAD terminal state to OutboxStatus enum.
-- Events that exhaust all retries transition to DEAD instead of FAILED.
-- FAILED is retained for backward compatibility (existing rows, monitoring queries).

ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD';

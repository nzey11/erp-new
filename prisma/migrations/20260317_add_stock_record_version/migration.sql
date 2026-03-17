-- Migration: add version field to StockRecord for optimistic locking
ALTER TABLE "StockRecord" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

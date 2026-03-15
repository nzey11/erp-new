-- Migration: 20260315_add_variant_tenant_and_catalog_projection
--
-- Adds tenantId to ProductVariant (was created via db push, no prior migration).
-- Creates ProductCatalogProjection table (was created via db push, no prior migration).
-- Both are guarded with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for safety.

-- ────────────────────────────────────────────────────────────
-- ProductVariant.tenantId
-- ────────────────────────────────────────────────────────────

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT '';

-- Remove the DEFAULT after backfill (column is now populated)
-- On fresh DB the DEFAULT '' is fine for test data; on production run backfill first.
-- See: scripts/backfill-product-variant-tenant.ts

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS "ProductVariant_tenantId_idx" ON "ProductVariant"("tenantId");

-- Tenant-scoped SKU uniqueness (replaces global SKU unique if needed)
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_tenantId_sku_key"
    ON "ProductVariant"("tenantId", "sku")
    WHERE "sku" IS NOT NULL;

-- FK: ProductVariant → Tenant
DO $$ BEGIN
    ALTER TABLE "ProductVariant"
        ADD CONSTRAINT "ProductVariant_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- ProductCatalogProjection
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductCatalogProjection" (
    "productId"         TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "slug"              TEXT,
    "sku"               TEXT,
    "imageUrl"          TEXT,
    "description"       TEXT,
    "unitId"            TEXT,
    "unitShortName"     TEXT,
    "categoryId"        TEXT,
    "categoryName"      TEXT,
    "price"             DOUBLE PRECISION NOT NULL,
    "discountedPrice"   DOUBLE PRECISION,
    "discountName"      TEXT,
    "discountType"      TEXT,
    "discountValue"     DOUBLE PRECISION,
    "avgRating"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount"       INTEGER NOT NULL DEFAULT 0,
    "childVariantCount" INTEGER NOT NULL DEFAULT 0,
    "priceRangeMin"     DOUBLE PRECISION,
    "priceRangeMax"     DOUBLE PRECISION,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "publishedToStore"  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCatalogProjection_pkey" PRIMARY KEY ("productId")
);

CREATE INDEX IF NOT EXISTS "ProductCatalogProjection_tenantId_idx"
    ON "ProductCatalogProjection"("tenantId");
CREATE INDEX IF NOT EXISTS "ProductCatalogProjection_tenantId_isActive_publishedToStore_idx"
    ON "ProductCatalogProjection"("tenantId", "isActive", "publishedToStore");
CREATE INDEX IF NOT EXISTS "ProductCatalogProjection_tenantId_categoryId_idx"
    ON "ProductCatalogProjection"("tenantId", "categoryId");
CREATE INDEX IF NOT EXISTS "ProductCatalogProjection_tenantId_name_idx"
    ON "ProductCatalogProjection"("tenantId", "name");

-- FK: ProductCatalogProjection → Tenant
DO $$ BEGIN
    ALTER TABLE "ProductCatalogProjection"
        ADD CONSTRAINT "ProductCatalogProjection_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: ProductCatalogProjection → Product
DO $$ BEGIN
    ALTER TABLE "ProductCatalogProjection"
        ADD CONSTRAINT "ProductCatalogProjection_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

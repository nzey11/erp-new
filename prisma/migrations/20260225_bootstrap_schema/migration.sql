-- Bootstrap Migration: Base Schema
-- This migration creates the full base schema for a clean database.
-- It uses IF NOT EXISTS guards throughout so it is safe to run against
-- databases where tables already exist (dev, staging, production).
--
-- Context: Early development used "prisma db push" which bypassed migration tracking.
-- This migration restores the complete schema so "prisma migrate deploy" can work
-- on a fresh database (required for CI and new environment setup).
--
-- Safety: Every DDL statement is guarded. No data is deleted or modified.

-- ────────────────────────────────────────────────────────────
-- ENUMS (PostgreSQL)
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ErpRole" AS ENUM ('admin', 'manager', 'accountant', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('draft', 'confirmed', 'cancelled', 'shipped', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM (
    'stock_receipt', 'write_off', 'stock_transfer', 'inventory_count',
    'purchase_order', 'incoming_shipment', 'supplier_return',
    'sales_order', 'outgoing_shipment', 'customer_return',
    'incoming_payment', 'outgoing_payment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentType" AS ENUM ('cash', 'bank_transfer', 'card');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CounterpartyType" AS ENUM ('customer', 'supplier', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MovementType" AS ENUM (
    'receipt', 'write_off', 'shipment', 'return',
    'transfer_out', 'transfer_in', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryType" AS ENUM ('pickup', 'courier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EcomPaymentMethod" AS ENUM ('tochka', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EcomPaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('active', 'passive', 'active_passive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountCategory" AS ENUM ('asset', 'liability', 'equity', 'income', 'expense', 'off_balance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TaxRegime" AS ENUM ('osno', 'usn_income', 'usn_income_expense', 'patent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
  -- NOTE: 'DEAD' value is added by migration 20260314_add_outbox_dead_status
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PartyType" AS ENUM ('person', 'organization');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PartySystemStatus" AS ENUM ('active', 'merged', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PartyEntityType" AS ENUM ('customer', 'counterparty');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OwnerRole" AS ENUM ('primary', 'backup');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MergeStatus" AS ENUM ('pending', 'approved', 'executed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- USER
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "User" (
    "id"        TEXT NOT NULL,
    "username"  TEXT NOT NULL,
    "password"  TEXT NOT NULL,
    "email"     TEXT,
    "role"      "ErpRole" NOT NULL DEFAULT 'viewer',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");

-- ────────────────────────────────────────────────────────────
-- UNIT
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Unit" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Unit_shortName_key" ON "Unit"("shortName");

-- ────────────────────────────────────────────────────────────
-- PRODUCT CATEGORY
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductCategory" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "parentId"  TEXT,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductCategory_parentId_order_idx" ON "ProductCategory"("parentId", "order");

DO $$ BEGIN
    ALTER TABLE "ProductCategory"
        ADD CONSTRAINT "ProductCategory_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- VARIANT TYPES / OPTIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VariantType" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VariantType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VariantType_isActive_order_idx" ON "VariantType"("isActive", "order");

CREATE TABLE IF NOT EXISTS "VariantOption" (
    "id"            TEXT NOT NULL,
    "variantTypeId" TEXT NOT NULL,
    "value"         TEXT NOT NULL,
    "order"         INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VariantOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VariantOption_variantTypeId_order_idx" ON "VariantOption"("variantTypeId", "order");

-- FK: VariantOption → VariantType
DO $$ BEGIN
    ALTER TABLE "VariantOption"
        ADD CONSTRAINT "VariantOption_variantTypeId_fkey"
        FOREIGN KEY ("variantTypeId") REFERENCES "VariantType"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- PRODUCT (base schema — columns added by later migrations are excluded)
-- imageUrls: added by 20260227_add_product_image_urls
-- masterProductId, isMainInGroup, variantGroupName: added by 20260226_add_variant_hierarchy
-- tenantId: added by 20260315_add_product_tenantId_provenance
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Product" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "sku"              TEXT,
    "barcode"          TEXT,
    "description"      TEXT,
    "unitId"           TEXT NOT NULL,
    "categoryId"       TEXT,
    "imageUrl"         TEXT,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "seoTitle"         TEXT,
    "seoDescription"   TEXT,
    "seoKeywords"      TEXT,
    "slug"             TEXT,
    "publishedToStore" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_barcode_key" ON "Product"("barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
CREATE INDEX IF NOT EXISTS "Product_slug_idx" ON "Product"("slug");

-- FK: Product → Unit
DO $$ BEGIN
    ALTER TABLE "Product"
        ADD CONSTRAINT "Product_unitId_fkey"
        FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Product → ProductCategory
DO $$ BEGIN
    ALTER TABLE "Product"
        ADD CONSTRAINT "Product_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- PRODUCT VARIANT LINK (needed by 20260226 migration)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductVariantLink" (
    "id"              TEXT NOT NULL,
    "productId"       TEXT NOT NULL,
    "linkedProductId" TEXT NOT NULL,
    "groupName"       TEXT NOT NULL,
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariantLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariantLink_productId_linkedProductId_key"
    ON "ProductVariantLink"("productId", "linkedProductId");
CREATE INDEX IF NOT EXISTS "ProductVariantLink_productId_idx" ON "ProductVariantLink"("productId");

-- FK: ProductVariantLink → Product
DO $$ BEGIN
    ALTER TABLE "ProductVariantLink"
        ADD CONSTRAINT "ProductVariantLink_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ProductVariantLink"
        ADD CONSTRAINT "ProductVariantLink_linkedProductId_fkey"
        FOREIGN KEY ("linkedProductId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- PRODUCT VARIANT
-- ────────────────────────────────────────────────────────────

-- ProductVariant: base table without tenantId
-- tenantId was added to local dev via db push but has no migration
-- and may not exist on production — excluded to keep bootstrap safe
CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id"              TEXT NOT NULL,
    "productId"       TEXT NOT NULL,
    "optionId"        TEXT NOT NULL,
    "sku"             TEXT,
    "barcode"         TEXT,
    "priceAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_barcode_key" ON "ProductVariant"("barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_optionId_key" ON "ProductVariant"("productId", "optionId");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- FK: ProductVariant → Product
DO $$ BEGIN
    ALTER TABLE "ProductVariant"
        ADD CONSTRAINT "ProductVariant_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: ProductVariant → VariantOption
DO $$ BEGIN
    ALTER TABLE "ProductVariant"
        ADD CONSTRAINT "ProductVariant_optionId_fkey"
        FOREIGN KEY ("optionId") REFERENCES "VariantOption"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- SKU COUNTER
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SkuCounter" (
    "id"         TEXT NOT NULL,
    "prefix"     TEXT NOT NULL DEFAULT 'SKU',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SkuCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SkuCounter_prefix_key" ON "SkuCounter"("prefix");

-- ────────────────────────────────────────────────────────────
-- CUSTOM FIELDS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomFieldDefinition" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'text',
    "options"   TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomFieldDefinition_isActive_order_idx" ON "CustomFieldDefinition"("isActive", "order");

CREATE TABLE IF NOT EXISTS "ProductCustomField" (
    "id"           TEXT NOT NULL,
    "productId"    TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value"        TEXT NOT NULL,
    CONSTRAINT "ProductCustomField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCustomField_productId_definitionId_key"
    ON "ProductCustomField"("productId", "definitionId");
CREATE INDEX IF NOT EXISTS "ProductCustomField_definitionId_idx" ON "ProductCustomField"("definitionId");

-- FK: ProductCustomField → CustomFieldDefinition
DO $$ BEGIN
    ALTER TABLE "ProductCustomField"
        ADD CONSTRAINT "ProductCustomField_definitionId_fkey"
        FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: ProductCustomField → Product
DO $$ BEGIN
    ALTER TABLE "ProductCustomField"
        ADD CONSTRAINT "ProductCustomField_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- PRODUCT DISCOUNT
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductDiscount" (
    "id"        TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      "DiscountType" NOT NULL,
    "value"     DOUBLE PRECISION NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo"   TIMESTAMP(3),
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDiscount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductDiscount_productId_isActive_validFrom_idx"
    ON "ProductDiscount"("productId", "isActive", "validFrom");

-- FK: ProductDiscount → Product
DO $$ BEGIN
    ALTER TABLE "ProductDiscount"
        ADD CONSTRAINT "ProductDiscount_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- COUNTERPARTY
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Counterparty" (
    "id"            TEXT NOT NULL,
    "type"          "CounterpartyType" NOT NULL DEFAULT 'customer',
    "name"          TEXT NOT NULL,
    "legalName"     TEXT,
    "inn"           TEXT,
    "kpp"           TEXT,
    "bankAccount"   TEXT,
    "bankName"      TEXT,
    "bik"           TEXT,
    "address"       TEXT,
    "phone"         TEXT,
    "email"         TEXT,
    "contactPerson" TEXT,
    "notes"         TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    -- tenantId added by 20260314_add_counterparty_tenant
    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Counterparty_inn_key" ON "Counterparty"("inn");
CREATE INDEX IF NOT EXISTS "Counterparty_type_idx" ON "Counterparty"("type");
CREATE INDEX IF NOT EXISTS "Counterparty_isActive_idx" ON "Counterparty"("isActive");
CREATE INDEX IF NOT EXISTS "Counterparty_name_idx" ON "Counterparty"("name");

-- ────────────────────────────────────────────────────────────
-- COUNTERPARTY INTERACTION / BALANCE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CounterpartyInteraction" (
    "id"             TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "subject"        TEXT,
    "description"    TEXT,
    "createdBy"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CounterpartyInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CounterpartyInteraction_counterpartyId_createdAt_idx"
    ON "CounterpartyInteraction"("counterpartyId", "createdAt");

-- FK: CounterpartyInteraction → Counterparty
DO $$ BEGIN
    ALTER TABLE "CounterpartyInteraction"
        ADD CONSTRAINT "CounterpartyInteraction_counterpartyId_fkey"
        FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CounterpartyBalance" (
    "id"             TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "balanceRub"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CounterpartyBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CounterpartyBalance_counterpartyId_key"
    ON "CounterpartyBalance"("counterpartyId");

-- FK: CounterpartyBalance → Counterparty
DO $$ BEGIN
    ALTER TABLE "CounterpartyBalance"
        ADD CONSTRAINT "CounterpartyBalance_counterpartyId_fkey"
        FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- WAREHOUSE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Warehouse" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "address"         TEXT,
    "responsibleName" TEXT,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    -- tenantId added by 20260313_add_warehouse_tenantId
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Warehouse_isActive_idx" ON "Warehouse"("isActive");

-- ────────────────────────────────────────────────────────────
-- DOCUMENT COUNTER
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DocumentCounter" (
    "id"         TEXT NOT NULL,
    "prefix"     TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentCounter_prefix_key" ON "DocumentCounter"("prefix");

-- ────────────────────────────────────────────────────────────
-- DOCUMENT
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Document" (
    "id"                 TEXT NOT NULL,
    "number"             TEXT NOT NULL,
    "type"               "DocumentType" NOT NULL,
    "status"             "DocumentStatus" NOT NULL DEFAULT 'draft',
    "date"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warehouseId"        TEXT,
    "targetWarehouseId"  TEXT,
    "counterpartyId"     TEXT,
    "totalAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"           TEXT NOT NULL DEFAULT 'RUB',
    "paymentType"        "PaymentType",
    "linkedDocumentId"   TEXT,
    "description"        TEXT,
    "notes"              TEXT,
    "createdBy"          TEXT,
    "confirmedAt"        TIMESTAMP(3),
    "cancelledAt"        TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "customerId"         TEXT,
    "deliveryType"       TEXT,
    "deliveryAddressId"  TEXT,
    "deliveryCost"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod"      TEXT,
    "paymentStatus"      TEXT NOT NULL DEFAULT 'pending',
    "paymentExternalId"  TEXT,
    "paidAt"             TIMESTAMP(3),
    "shippedAt"          TIMESTAMP(3),
    "deliveredAt"        TIMESTAMP(3),
    "confirmedBy"        TEXT,
    -- adjustmentsCreated added by 20260312_add_stock_movements
    -- tenantId added by 20260315_add_document_tenantId_provenance
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Document_number_key" ON "Document"("number");
CREATE INDEX IF NOT EXISTS "Document_type_status_date_idx" ON "Document"("type", "status", "date");
CREATE INDEX IF NOT EXISTS "Document_warehouseId_date_idx" ON "Document"("warehouseId", "date");
CREATE INDEX IF NOT EXISTS "Document_counterpartyId_date_idx" ON "Document"("counterpartyId", "date");
CREATE INDEX IF NOT EXISTS "Document_number_idx" ON "Document"("number");
CREATE INDEX IF NOT EXISTS "Document_customerId_idx" ON "Document"("customerId");
CREATE INDEX IF NOT EXISTS "Document_paymentStatus_idx" ON "Document"("paymentStatus");

-- FK: Document → Warehouse
DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_warehouseId_fkey"
        FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_targetWarehouseId_fkey"
        FOREIGN KEY ("targetWarehouseId") REFERENCES "Warehouse"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Document → Counterparty
DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_counterpartyId_fkey"
        FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Document self-reference (linked documents)
DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_linkedDocumentId_fkey"
        FOREIGN KEY ("linkedDocumentId") REFERENCES "Document"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- DOCUMENT ITEM
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DocumentItem" (
    "id"          TEXT NOT NULL,
    "documentId"  TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "variantId"   TEXT,
    "quantity"    DOUBLE PRECISION NOT NULL,
    "price"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedQty" DOUBLE PRECISION,
    "actualQty"   DOUBLE PRECISION,
    "difference"  DOUBLE PRECISION,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentItem_documentId_idx" ON "DocumentItem"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentItem_productId_idx" ON "DocumentItem"("productId");
CREATE INDEX IF NOT EXISTS "DocumentItem_variantId_idx" ON "DocumentItem"("variantId");

-- FK: DocumentItem → Document
DO $$ BEGIN
    ALTER TABLE "DocumentItem"
        ADD CONSTRAINT "DocumentItem_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: DocumentItem → Product
DO $$ BEGIN
    ALTER TABLE "DocumentItem"
        ADD CONSTRAINT "DocumentItem_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: DocumentItem → ProductVariant
DO $$ BEGIN
    ALTER TABLE "DocumentItem"
        ADD CONSTRAINT "DocumentItem_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- STOCK RECORD
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StockRecord" (
    "id"             TEXT NOT NULL,
    "warehouseId"    TEXT NOT NULL,
    "productId"      TEXT NOT NULL,
    "quantity"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageCost"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockRecord_warehouseId_productId_key"
    ON "StockRecord"("warehouseId", "productId");
CREATE INDEX IF NOT EXISTS "StockRecord_productId_idx" ON "StockRecord"("productId");

-- FK: StockRecord → Warehouse
DO $$ BEGIN
    ALTER TABLE "StockRecord"
        ADD CONSTRAINT "StockRecord_warehouseId_fkey"
        FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: StockRecord → Product
DO $$ BEGIN
    ALTER TABLE "StockRecord"
        ADD CONSTRAINT "StockRecord_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- PRICE LISTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PriceList" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PriceList_isActive_idx" ON "PriceList"("isActive");

CREATE TABLE IF NOT EXISTS "PurchasePrice" (
    "id"         TEXT NOT NULL,
    "productId"  TEXT NOT NULL,
    "supplierId" TEXT,
    "price"      DOUBLE PRECISION NOT NULL,
    "currency"   TEXT NOT NULL DEFAULT 'RUB',
    "validFrom"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo"    TIMESTAMP(3),
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchasePrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchasePrice_productId_isActive_validFrom_idx"
    ON "PurchasePrice"("productId", "isActive", "validFrom");
CREATE INDEX IF NOT EXISTS "PurchasePrice_supplierId_idx" ON "PurchasePrice"("supplierId");

-- FK: PurchasePrice → Product
DO $$ BEGIN
    ALTER TABLE "PurchasePrice"
        ADD CONSTRAINT "PurchasePrice_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: PurchasePrice → Counterparty
DO $$ BEGIN
    ALTER TABLE "PurchasePrice"
        ADD CONSTRAINT "PurchasePrice_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "Counterparty"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalePrice" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "priceListId" TEXT,
    "price"       DOUBLE PRECISION NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'RUB',
    "validFrom"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo"     TIMESTAMP(3),
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalePrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalePrice_productId_priceListId_isActive_validFrom_idx"
    ON "SalePrice"("productId", "priceListId", "isActive", "validFrom");

-- FK: SalePrice → Product
DO $$ BEGIN
    ALTER TABLE "SalePrice"
        ADD CONSTRAINT "SalePrice_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: SalePrice → PriceList
DO $$ BEGIN
    ALTER TABLE "SalePrice"
        ADD CONSTRAINT "SalePrice_priceListId_fkey"
        FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- ECOMMERCE: Customer / Address / Cart / Order
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Customer" (
    "id"               TEXT NOT NULL,
    "telegramId"       TEXT NOT NULL,
    "telegramUsername" TEXT,
    "name"             TEXT,
    "phone"            TEXT,
    "email"            TEXT,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "counterpartyId"   TEXT,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_telegramId_key" ON "Customer"("telegramId");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_counterpartyId_key" ON "Customer"("counterpartyId");
CREATE INDEX IF NOT EXISTS "Customer_isActive_idx" ON "Customer"("isActive");

-- FK: Customer → Counterparty
DO $$ BEGIN
    ALTER TABLE "Customer"
        ADD CONSTRAINT "Customer_counterpartyId_fkey"
        FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerAddress" (
    "id"            TEXT NOT NULL,
    "customerId"    TEXT NOT NULL,
    "label"         TEXT NOT NULL DEFAULT 'Дом',
    "recipientName" TEXT NOT NULL,
    "phone"         TEXT NOT NULL,
    "city"          TEXT NOT NULL,
    "street"        TEXT NOT NULL,
    "building"      TEXT NOT NULL,
    "apartment"     TEXT,
    "postalCode"    TEXT,
    "isDefault"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- FK: CustomerAddress → Customer
DO $$ BEGIN
    ALTER TABLE "CustomerAddress"
        ADD CONSTRAINT "CustomerAddress_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Document → Customer (delivery address and customer orders)
DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_deliveryAddressId_fkey"
        FOREIGN KEY ("deliveryAddressId") REFERENCES "CustomerAddress"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CartItem" (
    "id"            TEXT NOT NULL,
    "customerId"    TEXT NOT NULL,
    "productId"     TEXT NOT NULL,
    "variantId"     TEXT,
    "quantity"      INTEGER NOT NULL DEFAULT 1,
    "priceSnapshot" DOUBLE PRECISION NOT NULL,
    "addedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_customerId_productId_variantId_key"
    ON "CartItem"("customerId", "productId", "variantId");
CREATE INDEX IF NOT EXISTS "CartItem_customerId_idx" ON "CartItem"("customerId");

-- FK: CartItem → Customer
DO $$ BEGIN
    ALTER TABLE "CartItem"
        ADD CONSTRAINT "CartItem_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: CartItem → Product
DO $$ BEGIN
    ALTER TABLE "CartItem"
        ADD CONSTRAINT "CartItem_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: CartItem → ProductVariant
DO $$ BEGIN
    ALTER TABLE "CartItem"
        ADD CONSTRAINT "CartItem_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OrderCounter" (
    "id"         TEXT NOT NULL,
    "prefix"     TEXT NOT NULL DEFAULT 'ORD',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderCounter_prefix_key" ON "OrderCounter"("prefix");

CREATE TABLE IF NOT EXISTS "Order" (
    "id"                TEXT NOT NULL,
    "orderNumber"       TEXT NOT NULL,
    "customerId"        TEXT NOT NULL,
    "status"            "OrderStatus" NOT NULL DEFAULT 'pending',
    "documentId"        TEXT,
    "deliveryType"      "DeliveryType" NOT NULL,
    "deliveryAddressId" TEXT,
    "deliveryCost"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount"       DOUBLE PRECISION NOT NULL,
    "paymentMethod"     "EcomPaymentMethod",
    "paymentStatus"     "EcomPaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentExternalId" TEXT,
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "paidAt"            TIMESTAMP(3),
    "shippedAt"         TIMESTAMP(3),
    "deliveredAt"       TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_documentId_key" ON "Order"("documentId");
CREATE INDEX IF NOT EXISTS "Order_customerId_status_idx" ON "Order"("customerId", "status");
CREATE INDEX IF NOT EXISTS "Order_orderNumber_idx" ON "Order"("orderNumber");

-- FK: Order → Customer
DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Order → CustomerAddress
DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_deliveryAddressId_fkey"
        FOREIGN KEY ("deliveryAddressId") REFERENCES "CustomerAddress"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Order → Document
DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id"        TEXT NOT NULL,
    "orderId"   TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity"  INTEGER NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "total"     DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

-- FK: OrderItem → Order
DO $$ BEGIN
    ALTER TABLE "OrderItem"
        ADD CONSTRAINT "OrderItem_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: OrderItem → Product
DO $$ BEGIN
    ALTER TABLE "OrderItem"
        ADD CONSTRAINT "OrderItem_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: OrderItem → ProductVariant
DO $$ BEGIN
    ALTER TABLE "OrderItem"
        ADD CONSTRAINT "OrderItem_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- REVIEW / FAVORITE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Review" (
    "id"                 TEXT NOT NULL,
    "productId"          TEXT NOT NULL,
    "customerId"         TEXT NOT NULL,
    "orderId"            TEXT,
    "documentId"         TEXT,
    "rating"             INTEGER NOT NULL,
    "title"              TEXT,
    "comment"            TEXT,
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "isPublished"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Review_productId_isPublished_idx" ON "Review"("productId", "isPublished");
CREATE INDEX IF NOT EXISTS "Review_customerId_idx" ON "Review"("customerId");
CREATE INDEX IF NOT EXISTS "Review_documentId_idx" ON "Review"("documentId");

-- FK: Review → Product
DO $$ BEGIN
    ALTER TABLE "Review"
        ADD CONSTRAINT "Review_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Review → Customer
DO $$ BEGIN
    ALTER TABLE "Review"
        ADD CONSTRAINT "Review_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Review → Order
DO $$ BEGIN
    ALTER TABLE "Review"
        ADD CONSTRAINT "Review_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Review → Document
DO $$ BEGIN
    ALTER TABLE "Review"
        ADD CONSTRAINT "Review_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Favorite" (
    "id"         TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId"  TEXT NOT NULL,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_customerId_productId_key"
    ON "Favorite"("customerId", "productId");

-- FK: Favorite → Customer
DO $$ BEGIN
    ALTER TABLE "Favorite"
        ADD CONSTRAINT "Favorite_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Favorite → Product
DO $$ BEGIN
    ALTER TABLE "Favorite"
        ADD CONSTRAINT "Favorite_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- MISC: PromoBlock, Integration
-- NOTE: StorePage is created by migration 20260227_add_store_page
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PromoBlock" (
    "id"        TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "subtitle"  TEXT,
    "imageUrl"  TEXT NOT NULL,
    "linkUrl"   TEXT,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromoBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PromoBlock_isActive_order_idx" ON "PromoBlock"("isActive", "order");

-- StorePage created by 20260227_add_store_page (not base schema)

CREATE TABLE IF NOT EXISTS "Integration" (
    "id"        TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "settings"  JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_type_key" ON "Integration"("type");
CREATE INDEX IF NOT EXISTS "Integration_type_isEnabled_idx" ON "Integration"("type", "isEnabled");

-- ────────────────────────────────────────────────────────────
-- FINANCE: FinanceCategory, PaymentCounter, Payment
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FinanceCategory" (
    "id"                 TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "type"               TEXT NOT NULL,
    "isSystem"           BOOLEAN NOT NULL DEFAULT false,
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "order"              INTEGER NOT NULL DEFAULT 0,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    -- defaultAccountCode added by 20260305_add_category_account_code
    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinanceCategory_type_isActive_idx" ON "FinanceCategory"("type", "isActive");

CREATE TABLE IF NOT EXISTS "PaymentCounter" (
    "id"         TEXT NOT NULL,
    "prefix"     TEXT NOT NULL DEFAULT 'PAY',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PaymentCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCounter_prefix_key" ON "PaymentCounter"("prefix");

CREATE TABLE IF NOT EXISTS "Payment" (
    "id"             TEXT NOT NULL,
    "number"         TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "categoryId"     TEXT NOT NULL,
    "counterpartyId" TEXT,
    "documentId"     TEXT,
    "amount"         DOUBLE PRECISION NOT NULL,
    "paymentMethod"  "PaymentType" NOT NULL,
    "date"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_number_key" ON "Payment"("number");
CREATE INDEX IF NOT EXISTS "Payment_type_date_idx" ON "Payment"("type", "date");
CREATE INDEX IF NOT EXISTS "Payment_counterpartyId_idx" ON "Payment"("counterpartyId");
CREATE INDEX IF NOT EXISTS "Payment_documentId_idx" ON "Payment"("documentId");

-- FK: Payment → FinanceCategory
DO $$ BEGIN
    ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Payment → Counterparty
DO $$ BEGIN
    ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_counterpartyId_fkey"
        FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Payment → Document
DO $$ BEGIN
    ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- ACCOUNTING: Account, JournalEntry, LedgerLine, JournalCounter, CompanySettings
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Account" (
    "id"            TEXT NOT NULL,
    "code"          TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "type"          "AccountType" NOT NULL,
    "category"      "AccountCategory" NOT NULL,
    "parentId"      TEXT,
    "isSystem"      BOOLEAN NOT NULL DEFAULT true,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "order"         INTEGER NOT NULL DEFAULT 0,
    "analyticsType" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_code_key" ON "Account"("code");
CREATE INDEX IF NOT EXISTS "Account_code_idx" ON "Account"("code");
CREATE INDEX IF NOT EXISTS "Account_category_isActive_idx" ON "Account"("category", "isActive");

-- FK: Account self-reference
DO $$ BEGIN
    ALTER TABLE "Account"
        ADD CONSTRAINT "Account_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "Account"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "JournalCounter" (
    "id"         TEXT NOT NULL,
    "prefix"     TEXT NOT NULL DEFAULT 'JE',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "JournalCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JournalCounter_prefix_key" ON "JournalCounter"("prefix");

CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id"           TEXT NOT NULL,
    "number"       TEXT NOT NULL,
    "date"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description"  TEXT,
    "sourceType"   TEXT,
    "sourceId"     TEXT,
    "sourceNumber" TEXT,
    "isManual"     BOOLEAN NOT NULL DEFAULT false,
    "isReversed"   BOOLEAN NOT NULL DEFAULT false,
    "reversedById" TEXT,
    "createdBy"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_number_key" ON "JournalEntry"("number");
CREATE INDEX IF NOT EXISTS "JournalEntry_date_idx" ON "JournalEntry"("date");
CREATE INDEX IF NOT EXISTS "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- FK: JournalEntry self-reference (reversals)
DO $$ BEGIN
    ALTER TABLE "JournalEntry"
        ADD CONSTRAINT "JournalEntry_reversedById_fkey"
        FOREIGN KEY ("reversedById") REFERENCES "JournalEntry"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LedgerLine" (
    "id"             TEXT NOT NULL,
    "entryId"        TEXT NOT NULL,
    "accountId"      TEXT NOT NULL,
    "debit"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "counterpartyId" TEXT,
    "warehouseId"    TEXT,
    "productId"      TEXT,
    "currency"       TEXT,
    "amountRub"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LedgerLine_entryId_idx" ON "LedgerLine"("entryId");
CREATE INDEX IF NOT EXISTS "LedgerLine_accountId_idx" ON "LedgerLine"("accountId");
CREATE INDEX IF NOT EXISTS "LedgerLine_counterpartyId_idx" ON "LedgerLine"("counterpartyId");

-- FK: LedgerLine → JournalEntry
DO $$ BEGIN
    ALTER TABLE "LedgerLine"
        ADD CONSTRAINT "LedgerLine_entryId_fkey"
        FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: LedgerLine → Account
DO $$ BEGIN
    ALTER TABLE "LedgerLine"
        ADD CONSTRAINT "LedgerLine_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "Account"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CompanySettings" (
    "id"                        TEXT NOT NULL,
    "name"                      TEXT NOT NULL,
    "inn"                       TEXT,
    "kpp"                       TEXT,
    "ogrn"                      TEXT,
    "taxRegime"                 "TaxRegime" NOT NULL DEFAULT 'usn_income',
    "vatRate"                   DOUBLE PRECISION NOT NULL DEFAULT 20,
    "usnRate"                   DOUBLE PRECISION NOT NULL DEFAULT 6,
    "initialCapital"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initialCapitalDate"        TIMESTAMP(3),
    "cashAccountId"             TEXT,
    "bankAccountId"             TEXT,
    "inventoryAccountId"        TEXT,
    "supplierAccountId"         TEXT,
    "customerAccountId"         TEXT,
    "vatAccountId"              TEXT,
    "vatPayableAccountId"       TEXT,
    "salesAccountId"            TEXT,
    "cogsAccountId"             TEXT,
    "profitAccountId"           TEXT,
    "retainedEarningsAccountId" TEXT,
    "fiscalYearStartMonth"      INTEGER NOT NULL DEFAULT 1,
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                 TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- ────────────────────────────────────────────────────────────
-- STOCK MOVEMENTS
-- Base StockMovement table is created here so that 20260312_add_reversing_movements
-- (which runs alphabetically before 20260312_add_stock_movements) can ALTER it.
-- 20260312_add_stock_movements is made idempotent with IF NOT EXISTS guards.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id"          TEXT NOT NULL,
    "documentId"  TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId"   TEXT,
    "quantity"    DOUBLE PRECISION NOT NULL,
    "cost"        DOUBLE PRECISION NOT NULL,
    "totalCost"   DOUBLE PRECISION NOT NULL,
    "type"        "MovementType" NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockMovement_documentId_idx" ON "StockMovement"("documentId");
CREATE INDEX IF NOT EXISTS "StockMovement_productId_warehouseId_idx" ON "StockMovement"("productId", "warehouseId");
CREATE INDEX IF NOT EXISTS "StockMovement_warehouseId_createdAt_idx" ON "StockMovement"("warehouseId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "StockMovement"
        ADD CONSTRAINT "StockMovement_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "StockMovement"
        ADD CONSTRAINT "StockMovement_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "StockMovement"
        ADD CONSTRAINT "StockMovement_warehouseId_fkey"
        FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "StockMovement"
        ADD CONSTRAINT "StockMovement_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- OUTBOX / WEBHOOK
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
    "id"            TEXT NOT NULL,
    "eventType"     TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId"   TEXT NOT NULL,
    "payload"       JSONB NOT NULL,
    "status"        "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "availableAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"   TIMESTAMP(3),
    "lastError"     TEXT,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- ProcessedWebhook created by 20260312_add_processed_webhook (not base schema)

-- ────────────────────────────────────────────────────────────
-- CRM: Party, PartyLink, PartyActivity, PartyOwner, MergeRequest
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Party" (
    "id"                    TEXT NOT NULL,
    "displayName"           TEXT NOT NULL,
    "displayNameManual"     BOOLEAN NOT NULL DEFAULT false,
    "type"                  "PartyType" NOT NULL DEFAULT 'person',
    "primaryOwnerUserId"    TEXT,
    "primaryCustomerId"     TEXT,
    "primaryCounterpartyId" TEXT,
    "lastActivityAt"        TIMESTAMP(3),
    "status"                "PartySystemStatus" NOT NULL DEFAULT 'active',
    "mergedIntoId"          TEXT,
    "mergedAt"              TIMESTAMP(3),
    "isActive"              BOOLEAN NOT NULL DEFAULT true,
    "notes"                 TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Party_primaryCustomerId_key" ON "Party"("primaryCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Party_primaryCounterpartyId_key" ON "Party"("primaryCounterpartyId");
CREATE INDEX IF NOT EXISTS "Party_primaryOwnerUserId_idx" ON "Party"("primaryOwnerUserId");
CREATE INDEX IF NOT EXISTS "Party_lastActivityAt_idx" ON "Party"("lastActivityAt");
CREATE INDEX IF NOT EXISTS "Party_status_idx" ON "Party"("status");
CREATE INDEX IF NOT EXISTS "Party_type_idx" ON "Party"("type");

-- FK: Party → User (primaryOwner)
DO $$ BEGIN
    ALTER TABLE "Party"
        ADD CONSTRAINT "Party_primaryOwnerUserId_fkey"
        FOREIGN KEY ("primaryOwnerUserId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: Party self-reference (merge)
DO $$ BEGIN
    ALTER TABLE "Party"
        ADD CONSTRAINT "Party_mergedIntoId_fkey"
        FOREIGN KEY ("mergedIntoId") REFERENCES "Party"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PartyLink" (
    "id"         TEXT NOT NULL,
    "partyId"    TEXT NOT NULL,
    "entityType" "PartyEntityType" NOT NULL,
    "entityId"   TEXT NOT NULL,
    "isPrimary"  BOOLEAN NOT NULL DEFAULT false,
    "linkedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartyLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartyLink_entityType_entityId_key" ON "PartyLink"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "PartyLink_partyId_idx" ON "PartyLink"("partyId");

-- FK: PartyLink → Party
DO $$ BEGIN
    ALTER TABLE "PartyLink"
        ADD CONSTRAINT "PartyLink_partyId_fkey"
        FOREIGN KEY ("partyId") REFERENCES "Party"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PartyActivity" (
    "id"         TEXT NOT NULL,
    "partyId"    TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId"   TEXT,
    "summary"    JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "PartyActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartyActivity_sourceType_sourceId_type_key"
    ON "PartyActivity"("sourceType", "sourceId", "type");
CREATE INDEX IF NOT EXISTS "PartyActivity_partyId_occurredAt_idx"
    ON "PartyActivity"("partyId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "PartyActivity_type_occurredAt_idx"
    ON "PartyActivity"("type", "occurredAt" DESC);

-- FK: PartyActivity → Party
DO $$ BEGIN
    ALTER TABLE "PartyActivity"
        ADD CONSTRAINT "PartyActivity_partyId_fkey"
        FOREIGN KEY ("partyId") REFERENCES "Party"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PartyOwner" (
    "id"         TEXT NOT NULL,
    "partyId"    TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "role"       "OwnerRole" NOT NULL DEFAULT 'primary',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "endedAt"    TIMESTAMP(3),
    CONSTRAINT "PartyOwner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartyOwner_partyId_role_isActive_key"
    ON "PartyOwner"("partyId", "role", "isActive");
CREATE INDEX IF NOT EXISTS "PartyOwner_partyId_idx" ON "PartyOwner"("partyId");
CREATE INDEX IF NOT EXISTS "PartyOwner_userId_idx" ON "PartyOwner"("userId");

-- FK: PartyOwner → Party
DO $$ BEGIN
    ALTER TABLE "PartyOwner"
        ADD CONSTRAINT "PartyOwner_partyId_fkey"
        FOREIGN KEY ("partyId") REFERENCES "Party"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: PartyOwner → User
DO $$ BEGIN
    ALTER TABLE "PartyOwner"
        ADD CONSTRAINT "PartyOwner_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: PartyOwner → User (assigner)
DO $$ BEGIN
    ALTER TABLE "PartyOwner"
        ADD CONSTRAINT "PartyOwner_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MergeRequest" (
    "id"              TEXT NOT NULL,
    "survivorId"      TEXT NOT NULL,
    "victimId"        TEXT NOT NULL,
    "detectionSource" TEXT NOT NULL,
    "confidence"      DOUBLE PRECISION,
    "matchReason"     TEXT,
    "status"          "MergeStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy"      TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "executedAt"      TIMESTAMP(3),
    "createdBy"       TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MergeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MergeRequest_survivorId_victimId_key"
    ON "MergeRequest"("survivorId", "victimId");
CREATE INDEX IF NOT EXISTS "MergeRequest_status_idx" ON "MergeRequest"("status");

-- FK: MergeRequest → Party (survivor)
DO $$ BEGIN
    ALTER TABLE "MergeRequest"
        ADD CONSTRAINT "MergeRequest_survivorId_fkey"
        FOREIGN KEY ("survivorId") REFERENCES "Party"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: MergeRequest → Party (victim)
DO $$ BEGIN
    ALTER TABLE "MergeRequest"
        ADD CONSTRAINT "MergeRequest_victimId_fkey"
        FOREIGN KEY ("victimId") REFERENCES "Party"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: MergeRequest → User (reviewer)
DO $$ BEGIN
    ALTER TABLE "MergeRequest"
        ADD CONSTRAINT "MergeRequest_reviewedBy_fkey"
        FOREIGN KEY ("reviewedBy") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ProductCatalogProjection: created via db push on local dev only.
-- No migration exists for this table. Excluded from bootstrap to avoid
-- column-mismatch errors on production databases that may have a different
-- or absent version of this table.
-- It will be created/updated when needed via a dedicated migration.

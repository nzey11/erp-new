-- Migration: 20260317_decimal_monetary_fields
--
-- Converts all monetary fields from FLOAT to DECIMAL(19,4) for financial precision.
-- This prevents floating-point rounding errors in financial calculations.
--
-- Note: PostgreSQL DECIMAL is equivalent to NUMERIC. Precision 19, scale 4 allows:
-- - Up to 15 digits before decimal point (trillions)
-- - 4 digits after decimal point (0.0001 precision)

-- ────────────────────────────────────────────────────────────
-- TenantSettings (vatRate, usnRate use DECIMAL(5,2) for percentages)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "TenantSettings" ALTER COLUMN "vatRate" TYPE DECIMAL(5,2);
ALTER TABLE "TenantSettings" ALTER COLUMN "usnRate" TYPE DECIMAL(5,2);
ALTER TABLE "TenantSettings" ALTER COLUMN "initialCapital" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- ProductVariant (priceAdjustment)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "ProductVariant" ALTER COLUMN "priceAdjustment" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- ProductDiscount (value)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "ProductDiscount" ALTER COLUMN "value" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- ProductCatalogProjection (price fields)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "ProductCatalogProjection" ALTER COLUMN "price" TYPE DECIMAL(19,4);
ALTER TABLE "ProductCatalogProjection" ALTER COLUMN "discountedPrice" TYPE DECIMAL(19,4);
ALTER TABLE "ProductCatalogProjection" ALTER COLUMN "discountValue" TYPE DECIMAL(19,4);
ALTER TABLE "ProductCatalogProjection" ALTER COLUMN "priceRangeMin" TYPE DECIMAL(19,4);
ALTER TABLE "ProductCatalogProjection" ALTER COLUMN "priceRangeMax" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- CounterpartyBalance (balanceRub)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CounterpartyBalance" ALTER COLUMN "balanceRub" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- StockRecord (averageCost, totalCostValue)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "StockRecord" ALTER COLUMN "averageCost" TYPE DECIMAL(19,4);
ALTER TABLE "StockRecord" ALTER COLUMN "totalCostValue" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- StockMovement (cost, totalCost)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "StockMovement" ALTER COLUMN "cost" TYPE DECIMAL(19,4);
ALTER TABLE "StockMovement" ALTER COLUMN "totalCost" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- Document (totalAmount, deliveryCost)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Document" ALTER COLUMN "totalAmount" TYPE DECIMAL(19,4);
ALTER TABLE "Document" ALTER COLUMN "deliveryCost" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- DocumentItem (price, total)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "DocumentItem" ALTER COLUMN "price" TYPE DECIMAL(19,4);
ALTER TABLE "DocumentItem" ALTER COLUMN "total" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- PurchasePrice (price)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "PurchasePrice" ALTER COLUMN "price" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- SalePrice (price)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "SalePrice" ALTER COLUMN "price" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- CartItem (priceSnapshot)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CartItem" ALTER COLUMN "priceSnapshot" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- Order (deliveryCost, totalAmount)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Order" ALTER COLUMN "deliveryCost" TYPE DECIMAL(19,4);
ALTER TABLE "Order" ALTER COLUMN "totalAmount" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- OrderItem (price, total)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE DECIMAL(19,4);
ALTER TABLE "OrderItem" ALTER COLUMN "total" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- Payment (amount)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- LedgerLine (debit, credit, amountRub)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "LedgerLine" ALTER COLUMN "debit" TYPE DECIMAL(19,4);
ALTER TABLE "LedgerLine" ALTER COLUMN "credit" TYPE DECIMAL(19,4);
ALTER TABLE "LedgerLine" ALTER COLUMN "amountRub" TYPE DECIMAL(19,4);

-- ────────────────────────────────────────────────────────────
-- CompanySettings (vatRate, usnRate use DECIMAL(5,2), initialCapital DECIMAL(19,4))
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CompanySettings" ALTER COLUMN "vatRate" TYPE DECIMAL(5,2);
ALTER TABLE "CompanySettings" ALTER COLUMN "usnRate" TYPE DECIMAL(5,2);
ALTER TABLE "CompanySettings" ALTER COLUMN "initialCapital" TYPE DECIMAL(19,4);

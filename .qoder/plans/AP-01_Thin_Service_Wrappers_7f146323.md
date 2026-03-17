# AP-01: Eliminate direct db imports in API routes

## Confirmed scope

81 route files import `from "@/lib/shared/db"` directly.  
Strategy: **thin wrappers** — move db calls into `lib/modules/*/services/*.service.ts`, routes import service instead of db.  
No business logic changes. No test rewrites. Just layer enforcement.

Existing useful services (already have db calls):
- `lib/modules/accounting/services/document-confirm.service.ts` — confirm flow
- `lib/modules/accounting/services/document-bulk-confirm.service.ts` — bulk confirm
- `lib/modules/accounting/services/counterparty.service.ts` — create counterparty
- `lib/modules/accounting/services/balance.service.ts` — balance recalculation
- `lib/modules/accounting/documents.ts` — `generateDocumentNumber` (already uses db)

---

## Task 1 — Phase A: documents + stock + finance (critical routes)

### 1a. Extend `lib/modules/accounting/services/document.service.ts` (CREATE)

New file with:
- `listDocuments(params)` — wraps the `db.document.findMany` + `db.document.count` from `documents/route.ts` GET
- `createDocument(data, tenantId, userId)` — wraps the `db.warehouse.findUnique` + `db.document.create` logic from `documents/route.ts` POST
- `getDocument(id, tenantId)` — single doc fetch from `documents/[id]/route.ts`
- `updateDocument(id, tenantId, data)` — from `documents/[id]/route.ts` PATCH/PUT
- `cancelDocument(id, tenantId)` — from `documents/[id]/cancel/route.ts`
- `fillInventory(id, tenantId, items)` — from `documents/[id]/fill-inventory/route.ts`
- `getDocumentTransitions(id, tenantId)` — from `documents/[id]/transitions/route.ts`
- `exportDocuments(params, tenantId)` — from `documents/export/route.ts`

Routes affected: `documents/route.ts`, `documents/[id]/route.ts`, `documents/[id]/cancel/route.ts`, `documents/[id]/fill-inventory/route.ts`, `documents/[id]/transitions/route.ts`, `documents/export/route.ts`

### 1b. Extend `lib/modules/accounting/services/stock.service.ts` (CREATE)

New file with:
- `getStock(params, tenantId)` — wraps entire GET from `stock/route.ts` (both legacy and enhanced modes)
- `exportStock(params, tenantId)` — from `stock/export/route.ts`

### 1c. Extend `lib/modules/finance/services/payment.service.ts` (CREATE)

New file with:
- `listPayments(params, tenantId)` — from `finance/payments/route.ts` GET
- `createPayment(data, tenantId)` — from `finance/payments/route.ts` POST
- `getPayment(id, tenantId)` — from `finance/payments/[id]/route.ts`
- `updatePayment(id, tenantId, data)` — from `finance/payments/[id]/route.ts`
- `listFinanceCategories(tenantId)` — from `finance/categories/route.ts`
- `createFinanceCategory(data, tenantId)` — from `finance/categories/route.ts`
- `updateFinanceCategory(id, tenantId, data)` — from `finance/categories/[id]/route.ts`
- `deleteFinanceCategory(id, tenantId)` — from `finance/categories/[id]/route.ts`

Routes affected (7): `finance/payments/route.ts`, `finance/payments/[id]/route.ts`, `finance/categories/route.ts`, `finance/categories/[id]/route.ts`

### Update `lib/modules/finance/index.ts`

Export the new payment/category service.

---

## Task 2 — Phase B: products, counterparties, warehouses, prices (high priority)

### 2a. Extend `lib/modules/accounting/services/product.service.ts` (CREATE)

Covers: `products/route.ts`, `products/[id]/route.ts`, `products/bulk/route.ts`, `products/export/route.ts`, `products/import/route.ts`, `products/[id]/custom-fields/route.ts`, `products/[id]/discounts/route.ts`, `products/[id]/duplicate/route.ts`, `products/[id]/variant-links/route.ts`, `products/[id]/variants/route.ts`

Key functions:
- `listProducts(params, tenantId)` — full query with filters/sorts/includes (already complex, lift verbatim)
- `getProduct(id, tenantId)`
- `updateProduct(id, tenantId, data, tx?)`
- `deleteProduct(id, tenantId, tx?)`
- ... other per-route operations

### 2b. Extend existing `lib/modules/accounting/services/counterparty.service.ts`

Add read operations: `listCounterparties`, `getCounterparty`, `updateCounterparty`, `deleteCounterparty`, `listInteractions`, `createInteraction`

### 2c. `lib/modules/accounting/services/warehouse.service.ts` (CREATE)

- `listWarehouses(tenantId)`, `createWarehouse`, `getWarehouse`, `updateWarehouse`, `deleteWarehouse`

### 2d. `lib/modules/accounting/services/price.service.ts` (CREATE)

Covers: `prices/sale/route.ts`, `prices/purchase/route.ts`, `price-lists/route.ts`, `price-lists/[id]/route.ts`, `price-lists/[id]/prices/route.ts`

---

## Task 3 — Phase C: remaining routes

New thin-wrapper services for:
- `lib/modules/accounting/services/category.service.ts` — categories CRUD
- `lib/modules/accounting/services/unit.service.ts` — units CRUD
- `lib/modules/accounting/services/variant-type.service.ts` — variant types/options
- `lib/modules/accounting/services/custom-field.service.ts` — custom fields
- `lib/modules/accounting/services/cms-page.service.ts` — CMS pages (accounting)
- `lib/modules/accounting/services/report.service.ts` — reports (balances, profitability, purchases-analytics)
- `lib/modules/accounting/services/sku.service.ts` — SKU counter
- `lib/modules/accounting/services/settings.service.ts` — company settings
- `lib/modules/accounting/services/integration.service.ts` — integrations, telegram
- `lib/modules/accounting/services/dashboard.service.ts` — dashboard trends
- `lib/modules/accounting/services/journal.service.ts` — journal reverse
- `lib/modules/accounting/services/account.service.ts` — accounts/balances
- `lib/modules/ecommerce/services/*.service.ts` — ecommerce routes (cart, checkout, orders, etc.)
- `lib/modules/auth/services/*.service.ts` — auth routes (login, setup, customer me/telegram)

---

## Task 4 — Update `lib/modules/accounting/index.ts` barrel

Export all new services so routes can import from `@/lib/modules/accounting`.

---

## Task 5 — Verify

After all phases:
- `npx tsc --noEmit` → 0 errors
- `npm run test:unit` → 272 passed
- `npm run test:integration` → 410+ passed
- Confirm lint rule can be escalated from `warn` to `error` in `eslint.config.mjs`

---

## Key constraints

- `tenantId` always from `session.tenantId`, never from request body — preserved as-is
- Outbox calls (`createOutboxEvent`) stay in routes / existing services — not moved
- No logic changes — only mechanical lift of db calls into service functions
- Each service file stays within its module boundary (`lib/modules/accounting/services/`, `lib/modules/finance/services/`, `lib/modules/ecommerce/services/`)

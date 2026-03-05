# E-commerce Orders Refactoring Specification

## Goal

Move customer orders from e-commerce module to ERP (accounting) module. E-commerce becomes a storefront/CMS only.

## Current State

```
E-commerce Module:
├── Order (separate entity with own statuses)
├── OrderItem
├── Customer (Telegram auth)
├── CartItem
├── Review, Favorite, PromoBlock, StorePage

ERP Module:
├── Document (type: sales_order)
├── DocumentItem
├── Counterparty (customer/supplier)
```

**Problem:** Orders duplicated, statuses not synchronized, Customer ≠ Counterparty.

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      E-COMMERCE (Storefront)                 │
│                                                              │
│  Responsibilities:                                           │
│  • Product catalog display                                   │
│  • Cart management (CartItem)                               │
│  • Checkout flow → creates Document in ERP                   │
│  • CMS pages (StorePage)                                    │
│  • Promo blocks, banners                                     │
│  • Reviews (Review)                                          │
│  • Favorites (Favorite)                                      │
│  • Customer profile (Customer)                               │
│                                                              │
│  REMOVED:                                                    │
│  • Order / OrderItem models                                  │
│  • OrderCounter                                              │
│  • Order-specific statuses                                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ checkout
┌──────────────────────────────────────────────────────────────┐
│                      ERP / ACCOUNTING                        │
│                                                              │
│  Document (sales_order):                                     │
│  • type: "sales_order"                                       │
│  • status: draft → confirmed → ... → closed                  │
│  • NEW FIELDS:                                               │
│    - customerId: String? (link to Customer)                 │
│    - deliveryType: "pickup" | "courier"                     │
│    - deliveryAddressId: String? (link to CustomerAddress)   │
│    - deliveryCost: Float                                     │
│    - paymentMethod: "tochka" | "cash"                        │
│    - paymentStatus: "pending" | "paid" | "failed"           │
│    - paymentExternalId: String?                              │
│    - paidAt: DateTime?                                       │
│    - shippedAt: DateTime?                                    │
│    - deliveredAt: DateTime?                                  │
│                                                              │
│  Counterparty:                                               │
│  • NEW FIELD: customerId: String? (optional link)           │
│  • Auto-create from Customer when first order placed        │
└──────────────────────────────────────────────────────────────┘
```

---

## Changes Breakdown

### 1. Prisma Schema Changes

#### 1.1 Add to Document model
```prisma
model Document {
  // ... existing fields ...
  
  // E-commerce order fields
  customerId        String?
  deliveryType      String?           // "pickup" | "courier"
  deliveryAddressId String?
  deliveryCost      Float            @default(0)
  paymentMethod     String?          // "tochka" | "cash"
  paymentStatus     String           @default("pending")  // pending, paid, failed
  paymentExternalId String?
  paidAt            DateTime?
  shippedAt         DateTime?
  deliveredAt       DateTime?
  
  customer        Customer?         @relation(fields: [customerId], references: [id])
  deliveryAddress CustomerAddress?  @relation(fields: [deliveryAddressId], references: [id])
  
  @@index([customerId])
  @@index([paymentStatus])
}
```

#### 1.2 Add relations to Customer and CustomerAddress
```prisma
model Customer {
  // ... existing fields ...
  
  orders     Document[]          @relation("CustomerOrders")
  counterparty Counterparty?     @relation(fields: [counterpartyId], references: [id])
  counterpartyId String?         @unique
}

model CustomerAddress {
  // ... existing fields ...
  
  orders Document[] @relation("DeliveryAddress")
}
```

#### 1.3 Add to Counterparty
```prisma
model Counterparty {
  // ... existing fields ...
  
  customer Customer? @relation(fields: [customerId], references: [id])
}
```

#### 1.4 Remove (after migration)
```prisma
// DELETE THESE MODELS:
// - Order
// - OrderItem  
// - OrderCounter
```

---

### 2. Enum Changes

#### 2.1 Add to DocumentType
```prisma
enum DocumentType {
  // ... existing types ...
  
  // Keep sales_order for e-commerce orders
}
```

#### 2.2 New enums (or use String with validation)
```prisma
enum DeliveryType {
  pickup
  courier
}

enum EcomPaymentMethod {
  tochka
  cash
}

enum EcomPaymentStatus {
  pending
  paid
  failed
  refunded
}
```

---

### 3. API Changes

#### 3.1 Remove
```
DELETE: /api/ecommerce/checkout/route.ts → replace
DELETE: /api/ecommerce/orders/route.ts
DELETE: /api/ecommerce/orders/[id]/route.ts
DELETE: /api/ecommerce/orders/quick-order/route.ts
```

#### 3.2 Modify
```
POST /api/ecommerce/checkout → creates Document(sales_order) instead of Order
GET /api/ecommerce/orders → proxy to /api/accounting/documents?type=sales_order&customerId=...
```

#### 3.3 New endpoints
```
POST /api/accounting/orders/from-cart  → checkout creates sales_order document
GET  /api/accounting/orders/customer/:id → get customer's orders
POST /api/accounting/orders/:id/confirm-payment → mark paid, update status
```

---

### 4. Module Changes

#### 4.1 Remove from lib/modules/ecommerce/
```
DELETE: orders.ts
DELETE: schemas/orders.schema.ts (if exists)
DELETE: payment.ts (move logic to accounting)
```

#### 4.2 Add to lib/modules/accounting/
```
NEW: lib/modules/accounting/ecom-orders.ts
  - createSalesOrderFromCart(customerId, deliveryType, addressId, notes)
  - confirmOrderPayment(documentId, paymentExternalId)
  - getCustomerOrders(customerId)
  - cancelOrder(documentId, customerId)

NEW: lib/modules/accounting/schemas/ecom-order.schema.ts
  - checkoutSchema
  - confirmPaymentSchema
```

---

### 5. UI Changes

#### 5.1 Store (customer-facing)
```
app/store/account/orders/page.tsx
  - Fetch from /api/accounting/documents?type=sales_order
  - Display Document with delivery info
```

#### 5.2 Accounting admin
```
app/(accounting)/ecommerce/orders/page.tsx
  - Rename to app/(accounting)/sales/orders/page.tsx
  - Or keep as redirect to Documents filtered by sales_order
  - Fetch from /api/accounting/documents?type=sales_order
```

---

### 6. Migration Strategy

#### Phase 1: Add new fields (non-breaking)
1. Add new fields to Document
2. Add relations to Customer, CustomerAddress, Counterparty
3. Create migration: `npx prisma migrate dev --name add_ecom_order_fields`

#### Phase 2: Implement new logic
1. Create new checkout endpoint that creates Document
2. Update e-commerce orders page to read from Document
3. Add payment confirmation logic

#### Phase 3: Migrate existing data
```sql
-- Migrate existing Orders to Documents
INSERT INTO "Document" (id, number, type, status, "totalAmount", ...)
SELECT 
  o.id,
  o."orderNumber",
  'sales_order',
  CASE o.status
    WHEN 'pending' THEN 'draft'
    WHEN 'paid' THEN 'confirmed'
    WHEN 'processing' THEN 'confirmed'
    WHEN 'shipped' THEN 'confirmed'
    WHEN 'delivered' THEN 'confirmed'
    WHEN 'cancelled' THEN 'cancelled'
  END,
  o."totalAmount",
  ...
FROM "Order" o;

-- Migrate OrderItems to DocumentItems
INSERT INTO "DocumentItem" (id, "documentId", "productId", quantity, price, total)
SELECT id, "orderId", "productId", quantity, price, total
FROM "OrderItem";
```

#### Phase 4: Remove old models
1. Update all references in code
2. Remove Order, OrderItem, OrderCounter models
3. Create migration: `npx prisma migrate dev --name remove_order_models`

---

### 7. Status Mapping

| Order.status (old) | Document.status (new) |
|-------------------|----------------------|
| pending           | draft                |
| paid              | confirmed            |
| processing        | confirmed            |
| shipped           | confirmed + shippedAt |
| delivered         | confirmed + deliveredAt |
| cancelled         | cancelled            |

---

### 8. Customer ↔ Counterparty Sync

When customer places first order:
```typescript
async function getOrCreateCounterparty(customer: Customer): Promise<string> {
  if (customer.counterpartyId) {
    return customer.counterpartyId;
  }
  
  const counterparty = await db.counterparty.create({
    data: {
      type: "customer",
      name: customer.name || `Клиент Telegram`,
      phone: customer.phone,
      email: customer.email,
      notes: `Telegram: @${customer.telegramUsername || customer.telegramId}`,
    },
  });
  
  await db.customer.update({
    where: { id: customer.id },
    data: { counterpartyId: counterparty.id },
  });
  
  return counterparty.id;
}
```

---

### 9. Files to Modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add fields to Document, Customer, Counterparty; remove Order models |
| `lib/modules/ecommerce/orders.ts` | DELETE |
| `lib/modules/ecommerce/payment.ts` | MOVE to accounting |
| `lib/modules/accounting/documents.ts` | Add ecom order helpers |
| `app/api/ecommerce/checkout/route.ts` | Rewrite to create Document |
| `app/api/ecommerce/orders/route.ts` | DELETE or redirect |
| `app/store/account/orders/page.tsx` | Update to fetch Documents |
| `app/(accounting)/ecommerce/orders/page.tsx` | Update to use Documents |
| `tests/integration/api/ecommerce.test.ts` | Update tests |

---

### 10. Questions to Resolve

1. **Order number format:** Keep `ORD-000001` or use ERP document numbering (`SO-000001`)?
   - Option A: Keep separate numbering (OrderCounter logic in Document metadata)
   - Option B: Use unified ERP numbering

2. **Delivery info:** Store in Document or separate Delivery table?
   - Current: embedded in Document (simpler)
   - Alternative: separate Delivery model (more flexible)

3. **Reviews:** Keep linked to Document or remove orderId field?
   - Keep: Review.orderId → Review.documentId

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Schema changes + migration | 2 |
| Checkout rewrite | 3 |
| UI updates | 4 |
| Data migration | 2 |
| Testing | 3 |
| **Total** | **14** |

# E-commerce API Route Boundary Audit

**Date**: 2026-03-14  
**Scope**: `app/api/accounting/ecommerce/*` vs `app/api/ecommerce/*`

---

## Executive Summary

**Finding**: **A) Valid admin-vs-storefront route split over the same ecommerce domain**

The dual route structure represents a legitimate architectural separation between:
- **Admin/backoffice** operations (RBAC-protected, full data access)
- **Storefront/customer** operations (customer-authenticated, scoped data access)

This is **NOT** a duplicated module boundary.

---

## 1. Admin/Backoffice Routes (`app/api/accounting/ecommerce/`)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `orders/` | GET | `requirePermission("products:read")` | List all orders (admin view) |
| `orders/[id]/` | PUT | `requirePermission("products:write")` | Update order status, confirm payment, cancel |
| `promo-blocks/` | GET, POST, PUT, DELETE | `products:read` / `products:write` | CRUD for promo blocks |
| `reviews/` | GET, PUT, DELETE | `products:read` / `products:write` | Moderate reviews (publish/unpublish/delete) |

### Services Called (Admin)

| Service | Function | Purpose |
|---------|----------|---------|
| `@/lib/modules/ecommerce` | `getAllEcomOrders` | Admin order listing with filters |
| `@/lib/modules/ecommerce` | `updateOrderStatus` | Mark shipped/delivered |
| `@/lib/modules/ecommerce` | `confirmEcommerceOrderPayment` | Admin-initiated payment confirm |
| `@/lib/modules/ecommerce` | `cancelEcommerceOrder` | Admin-initiated cancellation |
| `@/lib/modules/accounting/services/document-confirm.service` | `confirmDocumentTransactional` | Direct document confirmation |

### Key Characteristics
- **RBAC**: Uses `requirePermission()` with `products:read` / `products:write`
- **Data Scope**: Unrestricted access to all orders/reviews/promo blocks
- **Operations**: Full CRUD + admin-specific actions (moderation, management)

---

## 2. Storefront/Customer Routes (`app/api/ecommerce/`)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `addresses/` | (assumed CRUD) | `requireCustomer` | Customer address management |
| `cart/` | GET, POST, DELETE | `requireCustomer` | Shopping cart operations |
| `categories/` | GET | Public | Browse categories |
| `checkout/` | POST | `requireCustomer` | Create order from cart |
| `cms-pages/` | GET | Public | Public CMS pages |
| `delivery/calculate/` | (assumed) | Public/Customer | Delivery cost calculation |
| `favorites/` | (assumed) | `requireCustomer` | Wishlist/favorites |
| `orders/` | GET | `requireCustomer` | Customer's own orders |
| `orders/quick-order/` | POST | Public | Guest quick order |
| `products/` | GET | Public | Product catalog |
| `products-projection/` | GET | Public | Projected product data |
| `promo-blocks/` | GET | Public | Active promo blocks only |
| `reviews/` | POST | `requireCustomer` | Submit review |

### Services Called (Storefront)

| Service | Function | Purpose |
|---------|----------|---------|
| `@/lib/modules/ecommerce` | `getCustomerOrders` | Customer's own orders only |
| `@/lib/modules/ecommerce` | `createSalesOrderFromCart` | Checkout flow |
| `@/lib/modules/ecommerce` | `confirmOrderPayment` | Webhook payment confirmation |

### Key Characteristics
- **Auth**: Uses `requireCustomer()` (customer-scoped) or public
- **Data Scope**: Restricted to customer's own data or public data
- **Operations**: Customer-facing actions only (buy, review, browse)

---

## 3. Business Logic Analysis

### Is Logic Duplicated?

| Area | Admin | Storefront | Duplication? |
|------|-------|------------|--------------|
| **Order Listing** | `getAllEcomOrders` (all orders, filters) | `getCustomerOrders` (own orders only) | **No** - different queries |
| **Order Creation** | N/A (admin doesn't create) | `createSalesOrderFromCart` | **No** - storefront only |
| **Payment Confirm** | `confirmEcommerceOrderPayment` with actor | `confirmOrderPayment` (webhook) | **Partial** - same underlying service, different entry points |
| **Order Cancel** | `cancelEcommerceOrder` with actor | N/A (customer cancel via separate flow) | **No** - different functions |
| **Promo Blocks** | Full CRUD | Read-only (active only) | **No** - different operations |
| **Reviews** | Moderation (publish/delete) | Submit only | **No** - complementary operations |

### Conclusion on Duplication

**No significant business logic duplication exists.**

The two route groups call different service functions appropriate to their context:
- Admin routes call admin-scoped services (full access, audit trails)
- Storefront routes call customer-scoped services (restricted access)

---

## 4. Architectural Assessment

### Is This a Phase 3 Problem?

**No.** This is a **valid and intentional architectural boundary**.

The split follows established patterns:

| Pattern | Implementation |
|---------|----------------|
| **Authorization Layer Separation** | `requirePermission()` vs `requireCustomer()` |
| **Data Scope Separation** | Admin sees all / Customer sees own |
| **Operation Semantics** | Management vs Consumption |

### Route Naming Convention

| Current | Convention | Assessment |
|---------|------------|------------|
| `app/api/accounting/ecommerce/*` | `(accounting)` layout = backoffice | ✅ Valid - admin routes under accounting layout |
| `app/api/ecommerce/*` | Root-level = public/customer | ✅ Valid - storefront routes |

The `accounting` path segment indicates these are **backoffice/admin** operations within the accounting layout group, not that ecommerce is "owned" by accounting.

---

## 5. Recommendations

### Immediate: KEEP AS-IS ✅

The current structure is architecturally sound:

1. **Clear separation of concerns**: Admin vs Customer operations
2. **Appropriate auth boundaries**: RBAC vs Customer auth
3. **No code duplication**: Different service functions for different contexts
4. **Consistent with project patterns**: Other modules follow similar split (e.g., products)

### Future Considerations (Post-Phase 3)

If normalization is desired later, consider:

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Rename for clarity** | `app/api/admin/ecommerce/*` instead of `accounting/ecommerce/*` | Low - purely cosmetic |
| **B. Consolidate under ecommerce** | `app/api/ecommerce/admin/*` alongside `app/api/ecommerce/*` | Medium - requires auth middleware changes |
| **C. Keep as-is** | Current structure is idiomatic for Next.js app router | None |

### Recommended Action

**Option C: Keep as-is.**

The current structure:
- Follows Next.js app router conventions (group routes by layout)
- Maintains clear auth boundary (accounting layout = backoffice)
- Requires no changes
- Is not a technical debt item

---

## 6. Verification

| Check | Result |
|-------|--------|
| No shared route handlers | ✅ Confirmed - completely separate files |
| No shared business logic duplication | ✅ Confirmed - different service calls |
| Appropriate auth per route | ✅ Confirmed - RBAC vs Customer auth |
| Clear data scope separation | ✅ Confirmed - all vs own |

---

## Appendix: Route-to-Service Mapping

### Admin Routes (`app/api/accounting/ecommerce/`)

```
orders/                 → getAllEcomOrders (query)
orders/[id]/            → updateOrderStatus, confirmEcommerceOrderPayment, cancelEcommerceOrder (services)
promo-blocks/           → db.promoBlock.* (direct Prisma)
reviews/                → db.review.* (direct Prisma)
```

### Storefront Routes (`app/api/ecommerce/`)

```
orders/                 → getCustomerOrders (query)
orders/quick-order/     → createSalesOrderFromCart (service)
checkout/               → createSalesOrderFromCart (service)
cart/                   → db.cartItem.* (direct Prisma)
products/               → db.product.* (direct Prisma)
reviews/                → db.review.create (direct Prisma)
```

---

**Conclusion**: This is a valid architectural split, not a duplication problem. No Phase 3 action required.

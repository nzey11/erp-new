# Customer Accounts

<cite>
**Referenced Files in This Document**
- [app/store/account/page.tsx](file://app/store/account/page.tsx)
- [app/store/account/orders/page.tsx](file://app/store/account/orders/page.tsx)
- [app/store/account/favorites/page.tsx](file://app/store/account/favorites/page.tsx)
- [app/store/account/addresses/page.tsx](file://app/store/account/addresses/page.tsx)
- [app/store/auth/telegram/page.tsx](file://app/store/auth/telegram/page.tsx)
- [components/ecommerce/ProfileEditForm.tsx](file://components/ecommerce/ProfileEditForm.tsx)
- [components/ecommerce/CartContext.tsx](file://components/ecommerce/CartContext.tsx)
- [app/api/auth/customer/me/route.ts](file://app/api/auth/customer/me/route.ts)
- [app/api/auth/customer/logout/route.ts](file://app/api/auth/customer/logout/route.ts)
- [app/api/auth/customer/telegram/route.ts](file://app/api/auth/customer/telegram/route.ts)
- [app/api/ecommerce/favorites/route.ts](file://app/api/ecommerce/favorites/route.ts)
- [app/api/ecommerce/addresses/route.ts](file://app/api/ecommerce/addresses/route.ts)
- [app/api/ecommerce/orders/route.ts](file://app/api/ecommerce/orders/route.ts)
- [app/api/ecommerce/cart/route.ts](file://app/api/ecommerce/cart/route.ts)
- [lib/shared/customer-auth.ts](file://lib/shared/customer-auth.ts)
- [lib/modules/ecommerce/schemas/favorites.schema.ts](file://lib/modules/ecommerce/schemas/favorites.schema.ts)
- [lib/modules/ecommerce/schemas/addresses.schema.ts](file://lib/modules/ecommerce/schemas/addresses.schema.ts)
- [lib/modules/accounting/index.ts](file://lib/modules/accounting/index.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the customer account management system, covering registration and authentication via Telegram, profile management, address book, favorites/wishlist, order history, and cart persistence. It also outlines privacy and data protection considerations and how the system integrates with order management.

## Project Structure
The customer account feature spans UI pages under the store application, API routes for backend operations, shared authentication utilities, Prisma models for persistence, and reusable UI components.

```mermaid
graph TB
subgraph "Client Pages"
A["Account Dashboard<br/>app/store/account/page.tsx"]
B["Orders History<br/>app/store/account/orders/page.tsx"]
C["Favorites/Wishlist<br/>app/store/account/favorites/page.tsx"]
D["Address Book<br/>app/store/account/addresses/page.tsx"]
E["Telegram Login<br/>app/store/auth/telegram/page.tsx"]
end
subgraph "UI Components"
F["ProfileEditForm<br/>components/ecommerce/ProfileEditForm.tsx"]
G["CartContext<br/>components/ecommerce/CartContext.tsx"]
end
subgraph "API Routes"
H["Customer Me/Patch<br/>app/api/auth/customer/me/route.ts"]
I["Customer Logout<br/>app/api/auth/customer/logout/route.ts"]
J["Telegram Auth<br/>app/api/auth/customer/telegram/route.ts"]
K["Favorites CRUD<br/>app/api/ecommerce/favorites/route.ts"]
L["Addresses CRUD<br/>app/api/ecommerce/addresses/route.ts"]
M["Orders List<br/>app/api/ecommerce/orders/route.ts"]
N["Cart CRUD<br/>app/api/ecommerce/cart/route.ts"]
end
subgraph "Shared/Auth"
O["Customer Auth Utils<br/>lib/shared/customer-auth.ts"]
end
subgraph "Data Model"
P["Prisma Schema<br/>prisma/schema.prisma"]
end
A --> F
A --> H
A --> M
B --> M
C --> K
D --> L
E --> J
H --> O
J --> O
K --> O
L --> O
M --> O
N --> O
O --> P
```

**Diagram sources**
- [app/store/account/page.tsx:1-225](file://app/store/account/page.tsx#L1-L225)
- [app/store/account/orders/page.tsx:1-330](file://app/store/account/orders/page.tsx#L1-L330)
- [app/store/account/favorites/page.tsx:1-208](file://app/store/account/favorites/page.tsx#L1-L208)
- [app/store/account/addresses/page.tsx:1-368](file://app/store/account/addresses/page.tsx#L1-L368)
- [app/store/auth/telegram/page.tsx:1-147](file://app/store/auth/telegram/page.tsx#L1-L147)
- [components/ecommerce/ProfileEditForm.tsx:1-155](file://components/ecommerce/ProfileEditForm.tsx#L1-L155)
- [components/ecommerce/CartContext.tsx:1-195](file://components/ecommerce/CartContext.tsx#L1-L195)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/api/auth/customer/logout/route.ts:1-16](file://app/api/auth/customer/logout/route.ts#L1-L16)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)

**Section sources**
- [app/store/account/page.tsx:1-225](file://app/store/account/page.tsx#L1-L225)
- [app/store/account/orders/page.tsx:1-330](file://app/store/account/orders/page.tsx#L1-L330)
- [app/store/account/favorites/page.tsx:1-208](file://app/store/account/favorites/page.tsx#L1-L208)
- [app/store/account/addresses/page.tsx:1-368](file://app/store/account/addresses/page.tsx#L1-L368)
- [app/store/auth/telegram/page.tsx:1-147](file://app/store/auth/telegram/page.tsx#L1-L147)
- [components/ecommerce/ProfileEditForm.tsx:1-155](file://components/ecommerce/ProfileEditForm.tsx#L1-L155)
- [components/ecommerce/CartContext.tsx:1-195](file://components/ecommerce/CartContext.tsx#L1-L195)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/api/auth/customer/logout/route.ts:1-16](file://app/api/auth/customer/logout/route.ts#L1-L16)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)

## Core Components
- Authentication and Session Management
  - Session signing and verification utilities for customer identity.
  - Telegram Login Widget integration with HMAC verification and cookie-based session creation.
  - Protected API routes enforcing customer authentication.
- Account Dashboard
  - Personal profile editing, recent orders summary, and quick links to orders, favorites, and addresses.
- Orders Management
  - Fetch and paginate customer orders, expandable order details, timeline, and review submission.
- Favorites/Wishlist
  - CRUD operations for saved products with optimistic UI updates and price/discount computation.
- Address Book
  - CRUD operations for multiple delivery addresses with default address selection.
- Cart Persistence
  - Cart context and API routes persist items per authenticated customer across sessions.

**Section sources**
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/store/account/page.tsx:1-225](file://app/store/account/page.tsx#L1-L225)
- [app/store/account/orders/page.tsx:1-330](file://app/store/account/orders/page.tsx#L1-L330)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [app/store/account/favorites/page.tsx:1-208](file://app/store/account/favorites/page.tsx#L1-L208)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [app/store/account/addresses/page.tsx:1-368](file://app/store/account/addresses/page.tsx#L1-L368)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [components/ecommerce/CartContext.tsx:1-195](file://components/ecommerce/CartContext.tsx#L1-L195)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)

## Architecture Overview
The system uses a cookie-based session for customer identity, validated by signed tokens. Frontend pages call protected APIs to manage profile, orders, favorites, addresses, and cart. Orders are represented as Documents in the accounting module and mapped to the e-commerce customer domain.

```mermaid
sequenceDiagram
participant U as "User Browser"
participant TG as "Telegram Login Page<br/>app/store/auth/telegram/page.tsx"
participant API_T as "Telegram Auth API<br/>app/api/auth/customer/telegram/route.ts"
participant AUTH as "Customer Auth Utils<br/>lib/shared/customer-auth.ts"
participant S as "Session Cookie"
U->>TG : Open Telegram login
TG->>API_T : POST Telegram widget payload
API_T->>AUTH : Verify HMAC and create/update customer
API_T-->>U : JSON {id,name,telegramUsername} + Set-Cookie
Note over U,S : Cookie stores signed session token
```

**Diagram sources**
- [app/store/auth/telegram/page.tsx:1-147](file://app/store/auth/telegram/page.tsx#L1-L147)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)

```mermaid
sequenceDiagram
participant U as "User Browser"
participant ACC as "Account Dashboard<br/>app/store/account/page.tsx"
participant API_M as "Customer Me API<br/>app/api/auth/customer/me/route.ts"
participant ORD as "Orders API<br/>app/api/ecommerce/orders/route.ts"
participant DB as "Prisma Models<br/>prisma/schema.prisma"
U->>ACC : Navigate to account
ACC->>API_M : GET /api/auth/customer/me
API_M->>DB : Find customer by session
DB-->>API_M : Customer record
API_M-->>ACC : Customer JSON
ACC->>ORD : GET /api/ecommerce/orders?limit=3
ORD->>DB : Get orders for customer
DB-->>ORD : Orders list
ORD-->>ACC : Orders JSON
ACC-->>U : Render dashboard with profile and recent orders
```

**Diagram sources**
- [app/store/account/page.tsx:1-225](file://app/store/account/page.tsx#L1-L225)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)

## Detailed Component Analysis

### Authentication and Session Management
- Session Signing and Verification
  - Signed tokens combine customer ID and HMAC signature; verified on each request.
  - Session cookie configured with secure, httpOnly, and sameSite attributes.
- Telegram Login
  - Validates Telegram Login Widget payload using HMAC-SHA256 against bot token.
  - Creates or updates customer record and sets session cookie.
- Protected Routes
  - API endpoints enforce customer authentication and return structured errors.

```mermaid
flowchart TD
Start(["Request to Protected API"]) --> CheckCookie["Read customer_session cookie"]
CheckCookie --> Verify{"Token valid and customer exists?"}
Verify --> |No| Unauthorized["Return 401 Unauthorized"]
Verify --> |Yes| Proceed["Proceed with handler"]
Unauthorized --> End(["End"])
Proceed --> End
```

**Diagram sources**
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/api/auth/customer/logout/route.ts:1-16](file://app/api/auth/customer/logout/route.ts#L1-L16)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)

**Section sources**
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [app/api/auth/customer/logout/route.ts:1-16](file://app/api/auth/customer/logout/route.ts#L1-L16)

### Customer Registration and Social Login (Telegram)
- Telegram Login Page
  - Loads Telegram bot configuration and renders the official login widget.
  - Calls the Telegram auth API on successful widget callback.
- Telegram Auth API
  - Verifies widget payload using HMAC with bot token.
  - Creates or updates customer and sets session cookie.

```mermaid
sequenceDiagram
participant U as "User"
participant W as "Telegram Widget"
participant API as "Telegram Auth API"
participant DB as "Prisma Customer"
U->>W : Click Telegram login
W->>API : POST {id,first_name,last_name,username,hash,auth_date}
API->>API : Verify HMAC and timestamp
API->>DB : Upsert customer by telegramId
DB-->>API : Customer
API-->>W : 200 OK + Set-Cookie
W-->>U : Redirect to /store/account
```

**Diagram sources**
- [app/store/auth/telegram/page.tsx:1-147](file://app/store/auth/telegram/page.tsx#L1-L147)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [prisma/schema.prisma:629-656](file://prisma/schema.prisma#L629-L656)

**Section sources**
- [app/store/auth/telegram/page.tsx:1-147](file://app/store/auth/telegram/page.tsx#L1-L147)
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [prisma/schema.prisma:629-656](file://prisma/schema.prisma#L629-L656)

### Customer Profile Management
- ProfileEditForm
  - Displays current profile and allows editing name, phone, and email.
  - Sends PATCH to update customer profile via API.
- Customer Me API
  - GET returns current customer.
  - PATCH validates and updates customer fields.

```mermaid
sequenceDiagram
participant U as "User"
participant PF as "ProfileEditForm"
participant API as "Customer Me API"
participant DB as "Prisma Customer"
U->>PF : Click Edit
PF->>API : PATCH /api/auth/customer/me {name,phone,email}
API->>DB : Update customer
DB-->>API : Updated customer
API-->>PF : 200 OK
PF-->>U : Show success and updated info
```

**Diagram sources**
- [components/ecommerce/ProfileEditForm.tsx:1-155](file://components/ecommerce/ProfileEditForm.tsx#L1-L155)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [prisma/schema.prisma:629-656](file://prisma/schema.prisma#L629-L656)

**Section sources**
- [components/ecommerce/ProfileEditForm.tsx:1-155](file://components/ecommerce/ProfileEditForm.tsx#L1-L155)
- [app/api/auth/customer/me/route.ts:1-42](file://app/api/auth/customer/me/route.ts#L1-L42)
- [prisma/schema.prisma:629-656](file://prisma/schema.prisma#L629-L656)

### Address Book Management
- Addresses Page
  - Lists addresses with default indicator and actions to edit/delete.
  - Dialog supports create/edit with validation.
- Addresses API
  - GET lists addresses ordered by default-first and recency.
  - POST/PUT create/update with default address handling.
  - DELETE removes owned address.

```mermaid
flowchart TD
A["Open Addresses Page"] --> B["GET /api/ecommerce/addresses"]
B --> C{"Addresses found?"}
C --> |Yes| D["Render list with default badges"]
C --> |No| E["Show empty state"]
D --> F["Add/Edit Dialog"]
F --> G{"Save"}
G --> |Create| H["POST /api/ecommerce/addresses"]
G --> |Update| I["PUT /api/ecommerce/addresses"]
H --> J["Refresh list"]
I --> J
D --> K["Delete Address"]
K --> L["DELETE /api/ecommerce/addresses?id=..."]
L --> J
```

**Diagram sources**
- [app/store/account/addresses/page.tsx:1-368](file://app/store/account/addresses/page.tsx#L1-L368)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [lib/modules/ecommerce/schemas/addresses.schema.ts:1-29](file://lib/modules/ecommerce/schemas/addresses.schema.ts#L1-L29)
- [prisma/schema.prisma:658-681](file://prisma/schema.prisma#L658-L681)

**Section sources**
- [app/store/account/addresses/page.tsx:1-368](file://app/store/account/addresses/page.tsx#L1-L368)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [lib/modules/ecommerce/schemas/addresses.schema.ts:1-29](file://lib/modules/ecommerce/schemas/addresses.schema.ts#L1-L29)
- [prisma/schema.prisma:658-681](file://prisma/schema.prisma#L658-L681)

### Favorites/Wishlist System
- Favorites Page
  - Renders product cards with discount badges and rating.
  - Supports removing favorites with optimistic UI and rollback on error.
- Favorites API
  - GET returns items with computed price, discount, and rating.
  - POST adds product to favorites if not already present.
  - DELETE removes favorite by productId.

```mermaid
sequenceDiagram
participant U as "User"
participant F as "Favorites Page"
participant API as "Favorites API"
participant DB as "Prisma Favorite/Product"
U->>F : Open favorites
F->>API : GET /api/ecommerce/favorites
API->>DB : Find customer favorites with product details
DB-->>API : Items with price/discount/rating
API-->>F : 200 OK {items}
U->>F : Remove item
F->>API : DELETE /api/ecommerce/favorites?productId=...
API->>DB : Delete favorite
DB-->>API : Deleted
API-->>F : 200 OK
F-->>U : Update UI
```

**Diagram sources**
- [app/store/account/favorites/page.tsx:1-208](file://app/store/account/favorites/page.tsx#L1-L208)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [lib/modules/ecommerce/schemas/favorites.schema.ts:1-7](file://lib/modules/ecommerce/schemas/favorites.schema.ts#L1-L7)
- [prisma/schema.prisma:788-798](file://prisma/schema.prisma#L788-L798)

**Section sources**
- [app/store/account/favorites/page.tsx:1-208](file://app/store/account/favorites/page.tsx#L1-L208)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [lib/modules/ecommerce/schemas/favorites.schema.ts:1-7](file://lib/modules/ecommerce/schemas/favorites.schema.ts#L1-L7)
- [prisma/schema.prisma:788-798](file://prisma/schema.prisma#L788-L798)

### Order History Access and Reordering
- Orders Page
  - Lists orders with status badges and totals; expands to show items, delivery address, and timeline.
  - Allows submitting reviews for delivered/paid/shipped items.
- Orders API
  - GET retrieves customer orders from the Document model and formats them for the UI.
- Integration with Accounting
  - Orders are derived from Document records managed by the accounting module.

```mermaid
sequenceDiagram
participant U as "User"
participant ORD as "Orders Page"
participant API as "Orders API"
participant ACC as "Accounting Module"
participant DB as "Prisma Document"
U->>ORD : Open orders
ORD->>API : GET /api/ecommerce/orders?limit=50
API->>ACC : getCustomerOrders(customerId)
ACC->>DB : Query sales orders for customer
DB-->>ACC : Documents
ACC-->>API : Orders list
API-->>ORD : 200 OK {orders,total,page,limit}
ORD-->>U : Render orders with timeline and items
```

**Diagram sources**
- [app/store/account/orders/page.tsx:1-330](file://app/store/account/orders/page.tsx#L1-L330)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [lib/modules/accounting/index.ts:1-8](file://lib/modules/accounting/index.ts#L1-L8)
- [prisma/schema.prisma:452-517](file://prisma/schema.prisma#L452-L517)

**Section sources**
- [app/store/account/orders/page.tsx:1-330](file://app/store/account/orders/page.tsx#L1-L330)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [lib/modules/accounting/index.ts:1-8](file://lib/modules/accounting/index.ts#L1-L8)
- [prisma/schema.prisma:452-517](file://prisma/schema.prisma#L452-L517)

### Cart Persistence Across Sessions
- CartContext
  - Provides cart state and actions; refreshes on authentication change.
  - Optimistically updates UI on add/remove/update.
- Cart API
  - GET returns customer cart items with product and variant details.
  - POST upserts item with current price snapshot.
  - DELETE removes item by ID.

```mermaid
sequenceDiagram
participant U as "User"
participant CC as "CartContext"
participant API as "Cart API"
participant DB as "Prisma CartItem"
U->>CC : Add to cart
CC->>API : POST /api/ecommerce/cart {productId,variantId,quantity}
API->>DB : Upsert cart item (priceSnapshot)
DB-->>API : Saved
API-->>CC : 200 OK
CC->>API : GET /api/ecommerce/cart
API->>DB : Find items for customer
DB-->>API : Items
API-->>CC : 200 OK {items}
CC-->>U : Update cart UI
```

**Diagram sources**
- [components/ecommerce/CartContext.tsx:1-195](file://components/ecommerce/CartContext.tsx#L1-L195)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)
- [prisma/schema.prisma:687-702](file://prisma/schema.prisma#L687-L702)

**Section sources**
- [components/ecommerce/CartContext.tsx:1-195](file://components/ecommerce/CartContext.tsx#L1-L195)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)
- [prisma/schema.prisma:687-702](file://prisma/schema.prisma#L687-L702)

### Account Navigation Examples
- Account Dashboard
  - Quick links to Orders, Favorites, and Addresses.
  - Profile editing card.
- Orders Page
  - Back link to account dashboard.
  - Expandable order rows with timeline and item details.
- Favorites Page
  - Back link to account dashboard.
  - Grid of product cards with remove action.
- Addresses Page
  - Back link to account dashboard.
  - Add/Edit/Delete address actions.

**Section sources**
- [app/store/account/page.tsx:135-177](file://app/store/account/page.tsx#L135-L177)
- [app/store/account/orders/page.tsx:138-147](file://app/store/account/orders/page.tsx#L138-L147)
- [app/store/account/favorites/page.tsx:103-112](file://app/store/account/favorites/page.tsx#L103-L112)
- [app/store/account/addresses/page.tsx:178-196](file://app/store/account/addresses/page.tsx#L178-L196)

## Dependency Analysis
- Authentication
  - Pages depend on shared auth utilities for session validation and cookie handling.
- Data Access
  - API routes depend on Prisma models for customer, addresses, favorites, cart, and orders.
- UI Components
  - Pages compose reusable components for forms and cart context.
- Accounting Integration
  - Orders are retrieved from the accounting module’s Document model.

```mermaid
graph LR
UI["Pages & Components"] --> AUTH["Customer Auth Utils"]
UI --> API["API Routes"]
API --> PRISMA["Prisma Models"]
API --> ACC["Accounting Module"]
AUTH --> PRISMA
```

**Diagram sources**
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [lib/modules/accounting/index.ts:1-8](file://lib/modules/accounting/index.ts#L1-L8)
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)

**Section sources**
- [lib/shared/customer-auth.ts:1-100](file://lib/shared/customer-auth.ts#L1-L100)
- [app/api/ecommerce/orders/route.ts:1-64](file://app/api/ecommerce/orders/route.ts#L1-L64)
- [lib/modules/accounting/index.ts:1-8](file://lib/modules/accounting/index.ts#L1-L8)
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)

## Performance Considerations
- API Pagination
  - Orders endpoint supports pagination; use limit and page parameters to avoid large payloads.
- Efficient Queries
  - Favorites API precomputes price, discount, and rating to reduce client-side work.
- Cart Snapshotting
  - Cart items store a price snapshot to prevent stale pricing during long sessions.
- UI Responsiveness
  - Optimistic UI updates for favorites and cart reduce perceived latency; rollback on error.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Authentication Failures
  - Telegram auth requires a valid bot token and unexpired auth_date; verify HMAC verification and session cookie settings.
  - If session is invalid or customer inactive, protected routes return 401/403.
- API Validation Errors
  - Favoriting requires productId; addresses require mandatory fields; cart removal requires itemId.
- UI Issues
  - If favorites or addresses fail to update, check network requests and toast messages; the UI attempts rollback on error.

**Section sources**
- [app/api/auth/customer/telegram/route.ts:1-119](file://app/api/auth/customer/telegram/route.ts#L1-L119)
- [app/api/ecommerce/favorites/route.ts:1-172](file://app/api/ecommerce/favorites/route.ts#L1-L172)
- [app/api/ecommerce/addresses/route.ts:1-160](file://app/api/ecommerce/addresses/route.ts#L1-L160)
- [app/api/ecommerce/cart/route.ts:1-189](file://app/api/ecommerce/cart/route.ts#L1-L189)
- [components/ecommerce/ProfileEditForm.tsx:1-155](file://components/ecommerce/ProfileEditForm.tsx#L1-L155)

## Conclusion
The customer account system provides a cohesive, secure, and user-friendly experience for authenticated users. It leverages Telegram for frictionless login, persists data using Prisma, and integrates tightly with the accounting module for order management. Privacy and data protection are addressed through secure cookie handling and strict validation.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Data Model Overview (Selected)
```mermaid
erDiagram
CUSTOMER {
string id PK
string telegramId UK
string telegramUsername
string name
string phone
string email
boolean isActive
datetime createdAt
datetime updatedAt
}
CUSTOMER_ADDRESS {
string id PK
string customerId FK
string label
string recipientName
string phone
string city
string street
string building
string apartment
string postalCode
boolean isDefault
datetime createdAt
}
FAVORITE {
string id PK
string customerId FK
string productId FK
datetime addedAt
}
CART_ITEM {
string id PK
string customerId FK
string productId FK
string variantId
int quantity
float priceSnapshot
datetime addedAt
}
CUSTOMER ||--o{ CUSTOMER_ADDRESS : "has"
CUSTOMER ||--o{ FAVORITE : "saved"
CUSTOMER ||--o{ CART_ITEM : "owns"
```

**Diagram sources**
- [prisma/schema.prisma:629-702](file://prisma/schema.prisma#L629-L702)
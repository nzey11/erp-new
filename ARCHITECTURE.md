# ListOpt ERP Architecture

## Project Structure

```
listopt-erp/
├── app/                         # Next.js App Router
│   ├── (accounting)/            # Accounting module pages (route group)
│   │   ├── page.tsx             # Dashboard
│   │   ├── catalog/             # Product catalog with category tree
│   │   ├── stock/               # Stock balances (reserve, cost, sale)
│   │   ├── purchases/           # Purchase documents
│   │   ├── sales/               # Sales documents + profitability
│   │   ├── finance/             # Payments + reports (P&L, cash flow, balances)
│   │   ├── counterparties/      # Counterparties (customers/suppliers)
│   │   ├── references/          # Reference data (units, warehouses, price lists)
│   │   ├── settings/            # Users management
│   │   ├── documents/[id]/      # Document detail (shared across all doc types)
│   │   ├── documents/           # [legacy, redirects to /purchases]
│   │   ├── products/            # [legacy, redirects to /catalog]
│   │   ├── warehouses/          # [legacy, redirects to /references]
│   │   └── reports/             # [legacy, redirects to /finance]
│   ├── api/
│   │   ├── auth/                # Authentication endpoints (shared)
│   │   │   ├── login/
│   │   │   ├── logout/
│   │   │   ├── me/
│   │   │   └── setup/
│   │   └── accounting/          # Accounting module API
│   │       ├── documents/       # CRUD + confirm/cancel actions
│   │       ├── products/
│   │       ├── counterparties/
│   │       ├── warehouses/
│   │       ├── stock/           # Enhanced: reserve, available, cost/sale values
│   │       ├── units/
│   │       ├── categories/
│   │       ├── price-lists/
│   │       ├── prices/          # purchase/ and sale/ sub-routes
│   │       ├── reports/         # balances, cash-flow, profit-loss, profitability
│   │       └── users/
│   └── login/                   # Login page
│
├── components/
│   ├── accounting/              # Accounting module UI components
│   │   ├── index.ts             # Barrel export
│   │   ├── DocumentsTable.tsx   # Documents list with filters
│   │   ├── ProductsTable.tsx    # Products catalog table
│   │   └── CounterpartiesTable.tsx
│   ├── ui/                      # Shared UI primitives (shadcn/ui)
│   └── *.tsx                    # Shared layout components
│
├── lib/
│   ├── index.ts                 # Main library entry point
│   ├── shared/                  # Shared utilities
│   │   ├── index.ts             # Barrel export
│   │   ├── db.ts                # Prisma client instance
│   │   ├── auth.ts              # Session management
│   │   ├── authorization.ts     # RBAC permissions
│   │   └── utils.ts             # Formatting helpers
│   ├── modules/
│   │   └── accounting/          # Accounting business logic
│   │       ├── index.ts         # Barrel export
│   │       ├── documents.ts     # Document types, constants
│   │       ├── balance.ts       # Counterparty balance calc
│   │       ├── stock.ts         # Stock calculations
│   │       └── finance.ts       # P&L, cash flow reports
│   └── generated/
│       └── prisma/              # Generated Prisma client
│
├── prisma/
│   └── schema.prisma            # Database schema
│
└── tests/
    ├── unit/                    # Unit tests
    ├── integration/             # Integration tests
    └── helpers/                 # Test utilities
```

## Module Organization Pattern

### Adding a New Module (e.g., `ecommerce`)

1. **Create business logic:**
   ```
   lib/modules/ecommerce/
   ├── index.ts           # Export all module functions
   ├── orders.ts          # Order processing logic
   ├── cart.ts            # Shopping cart logic
   └── payments.ts        # Payment processing
   ```

2. **Create API routes:**
   ```
   app/api/ecommerce/
   ├── orders/
   │   ├── route.ts       # GET/POST orders
   │   └── [id]/
   │       └── route.ts   # GET/PUT/DELETE order
   ├── cart/
   │   └── route.ts
   └── payments/
       └── route.ts
   ```

3. **Create pages (route group):**
   ```
   app/(ecommerce)/
   ├── layout.tsx         # Module-specific layout
   ├── page.tsx           # Module dashboard
   ├── orders/
   │   └── page.tsx
   └── products/
       └── page.tsx
   ```

4. **Create UI components:**
   ```
   components/ecommerce/
   ├── index.ts           # Barrel export
   ├── OrdersTable.tsx
   └── CartWidget.tsx
   ```

5. **Update lib/index.ts:**
   ```typescript
   export * from "./shared";
   export * as accounting from "./modules/accounting";
   export * as ecommerce from "./modules/ecommerce";  // Add this
   ```

## Import Conventions

### From pages/components:
```typescript
// Shared utilities
import { db, formatRub, formatDate } from "@/lib/shared/utils";
import { getCurrentUser } from "@/lib/shared/auth";

// Module-specific (accounting)
import { 
  recalculateCounterpartyBalance,
  STOCK_INCREASE_TYPES 
} from "@/lib/modules/accounting";

// Or via main entry:
import { accounting } from "@/lib";
accounting.recalculateCounterpartyBalance(...)

// UI components
import { DocumentsTable, ProductsTable } from "@/components/accounting";
```

### From API routes:
```typescript
import { db } from "@/lib/shared/db";
import { getCurrentUser, requireAuth } from "@/lib/shared/auth";
import { checkPermission } from "@/lib/shared/authorization";
import { generateDocNumber, DOCUMENT_TYPES } from "@/lib/modules/accounting";
```

## API Route Patterns

### Standard CRUD endpoints:
```
GET    /api/{module}/{resource}           # List with pagination
POST   /api/{module}/{resource}           # Create
GET    /api/{module}/{resource}/[id]      # Get by ID
PUT    /api/{module}/{resource}/[id]      # Update
DELETE /api/{module}/{resource}/[id]      # Delete
```

### Action endpoints:
```
POST   /api/{module}/{resource}/[id]/{action}
# Examples:
POST   /api/accounting/documents/[id]/confirm
POST   /api/accounting/documents/[id]/cancel
```

### Response format:
```typescript
// List response
{ data: T[], total: number, page?: number, limit?: number }

// Single item response
{ ...item }

// Error response
{ error: string }
```

## Database Access

Always use the shared Prisma instance:
```typescript
import { db } from "@/lib/shared/db";

// In API routes
const products = await db.product.findMany({ ... });

// In tests
import { db } from "@/lib/shared/db";
await db.product.create({ data: { ... } });
```

## Authentication & Authorization

```typescript
// In API routes
export async function GET(req: NextRequest) {
  const user = await requireAuth();  // Throws 401 if not authenticated
  
  // Check permission for action
  if (!checkPermission(user.role, "documents", "create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  
  // ... handle request
}
```

## Testing Structure

- **Unit tests** (`tests/unit/`): Test pure business logic functions
- **Integration tests** (`tests/integration/`): Test with real database

```bash
# Run all tests
npm test

# Run specific file
npm test -- tests/unit/lib/documents.test.ts
```

## Sub-module Policy

Бизнес-логика в `lib/modules/{module}/` хранится **плоской структурой** пока не появится реальная необходимость в разделении.

### Когда НЕ нужны под-модули:
- Файл < 300 строк
- 1-2 разработчика на модуль
- Функции легко находятся по имени файла

### Когда НУЖНЫ под-модули:
- Файл перерастает 300-400 строк -- выделить в директорию
- 3+ разработчика работают над одним модулем одновременно
- Область обрастает сложной логикой (например, партионный учёт, серийные номера)
- Новый модуль (ecommerce, ai-office) -- всегда начинать с плоской структуры

### Пример перехода:
```
# Было (плоская):
lib/modules/accounting/stock.ts           # 400+ строк, пора разделять

# Стало (под-модуль):
lib/modules/accounting/stock/
├── index.ts           # Barrel export (re-exports всё)
├── calculations.ts    # recalculateStock, updateStockForDocument
├── reserves.ts        # checkStockAvailability, reserve logic
└── batch-tracking.ts  # Новая функциональность
```

### Правило: страницы и API уже являются под-модулями
Файловая система Next.js (`/purchases`, `/sales`, `/stock`, `/finance`) естественно разделяет UI на домены.
Бизнес-логику разделяем **только когда файл реально вырос**, а не заранее.

## Navigation Structure

### Sidebar (Система учёта):
1. **Панель** `/` -- Dashboard
2. **Каталог** `/catalog` -- Category tree + products
3. **Склад** `/stock` -- Stock balances (qty, reserve, available, cost, sale)
4. **Закупки** `/purchases` -- Purchase orders, incoming shipments, supplier returns
5. **Продажи** `/sales` -- Sales orders, outgoing shipments, customer returns, profitability
6. **Финансы** `/finance` -- Incoming/outgoing payments, reports (P&L, cash flow, balances)
7. **Контрагенты** `/counterparties` -- Customers and suppliers
8. **Справочники** `/references` -- Units, warehouses, price lists
9. **Настройки** `/settings` -- Users management (bottom section)

## Deployment

Release-based CI/CD via GitHub Actions. See [`docs/deploy.md`](./docs/deploy.md) for the full reference.

**Flow:** `git push origin main` → pre-push checks → GitHub Actions verify (lint/test/build) → artifact deploy to VPS → `current` symlink switch → `pm2 reload` → smoke check

Production server: `/var/www/listopt-erp/`
- `releases/<id>/` — immutable release snapshots
- `shared/.env` — symlinked into every release
- `current` → symlink to active release
- `bin/` — stable deploy/rollback scripts

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# Auth
SESSION_SECRET="..."
SECURE_COOKIES="false"  # Set to "true" for HTTPS

# Runtime
NODE_ENV="production"
```

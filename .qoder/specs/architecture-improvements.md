# ListOpt ERP: Architecture Improvements Specification

**Version:** 1.1  
**Date:** 2026-03-12  
**Status:** Draft

---

## Executive Summary

This specification outlines a phased approach to improving the ListOpt ERP architecture. The main goals are:

1. **Security & Stability (P0)** — Critical production fixes
2. **Architecture Cleanup (P1)** — Stock movements, state machines, domain separation
3. **Scalability (P2)** — Durable events, tenant-ready seams, read projections
4. **Maturity (P3)** — Testing, monitoring, reporting

**Key Insight:** The main architectural tension points are:
- `Document` entity doing too much (god object)
- `confirm()` operation with too many side effects
- `accounting` module being too broad

**Core Principle:** Focus on one architectural anchor at a time. The strongest anchor is **Stock Movements + refactor confirm()** — this is the foundation for everything else.

---

## Phase 0: Critical Production Fixes

**Priority:** Immediate  
**Duration:** 1 week  
**Risk Level:** Low (no breaking changes)

### 0.1 Migrations Instead of db push

**Problem:** `prisma db push --accept-data-loss` in CI deploy can destroy data.

**Solution:** Use proper Prisma migrations.

**Changes:**

```bash
# Development
prisma migrate dev --name <migration_name>

# Production/CI
prisma migrate deploy
```

**Files to modify:**
- `.github/workflows/ci.yml` — Line 135: Replace `db push` with `migrate deploy`

```yaml
# Before
npx prisma db push --accept-data-loss

# After
npx prisma migrate deploy
```

**Verification:**
- [ ] Create initial migration from current schema
- [ ] Test migration on staging database
- [ ] Update CI workflow
- [ ] Document migration process

---

### 0.2 Structured Logging

**Problem:** `console.error()` used in 15+ API routes instead of centralized logger.

**Solution:** Replace all `console.*` calls with structured logger.

**Current logger implementation:**
```typescript
// lib/shared/logger.ts
export const logger = {
  info: (context: string, message: string, meta?: object) => { ... },
  warn: (context: string, message: string, meta?: object) => { ... },
  error: (context: string, message: string, meta?: object) => { ... },
};
```

**Files to update:**
- `app/api/accounting/upload/route.ts`
- `app/api/auth/customer/telegram/route.ts`
- `app/api/ecommerce/categories/route.ts`
- `app/api/ecommerce/checkout/route.ts`
- `app/api/ecommerce/cms-pages/[slug]/route.ts`
- `app/api/ecommerce/cms-pages/route.ts`
- `app/api/ecommerce/orders/quick-order/route.ts`
- `app/api/ecommerce/products/[slug]/related/route.ts`
- `app/api/ecommerce/products/[slug]/route.ts`
- `app/api/ecommerce/products/route.ts`
- `app/api/ecommerce/promo-blocks/route.ts`
- `app/api/integrations/telegram/route.ts`
- `lib/shared/authorization.ts`

**Example change:**
```typescript
// Before
console.error("Checkout error:", error);

// After
logger.error("checkout", "Checkout failed", { error: String(error), customerId });
```

**Enhancement to logger:**
```typescript
// Add request context
export function createRequestLogger(requestId: string, userId?: string) {
  return {
    info: (context: string, message: string, meta?: object) => 
      logger.info(context, message, { requestId, userId, ...meta }),
    error: (context: string, message: string, meta?: object) => 
      logger.error(context, message, { requestId, userId, ...meta }),
  };
}
```

**Verification:**
- [ ] Replace all console.error/log/warn in API routes
- [ ] Add requestId to all API responses (X-Request-Id header)
- [ ] Test error logging with stack traces

---

### 0.3 Webhook Idempotency

**Problem:** Payment webhooks can be received multiple times, causing duplicate processing.

**Solution:** Add `ProcessedWebhook` table to track processed webhooks.

**Schema change:**
```prisma
// prisma/schema.prisma

model ProcessedWebhook {
  id           String   @id @default(cuid())
  source       String   // "tochka", "telegram", etc.
  externalId   String   // Unique ID from the source
  payload      Json     // Original payload for debugging
  processedAt  DateTime @default(now())
  
  @@unique([source, externalId])
  @@index([source, processedAt])
}
```

**Implementation:**
```typescript
// lib/shared/webhook-idempotency.ts
export async function isWebhookProcessed(
  source: string, 
  externalId: string
): Promise<boolean> {
  const existing = await db.processedWebhook.findUnique({
    where: { source_externalId: { source, externalId } }
  });
  return !!existing;
}

export async function markWebhookProcessed(
  source: string, 
  externalId: string, 
  payload: object
): Promise<void> {
  await db.processedWebhook.create({
    data: { source, externalId, payload }
  });
}
```

**Update payment webhook handler:**
```typescript
// app/api/webhooks/ecommerce/tochka/route.ts
export async function POST(request: NextRequest) {
  const payload = await request.json();
  const externalId = payload.id;
  
  // Idempotency check
  if (await isWebhookProcessed("tochka", externalId)) {
    return NextResponse.json({ status: "already_processed" });
  }
  
  // Process webhook
  await handlePaymentWebhook(externalId, payload.status);
  
  // Mark as processed
  await markWebhookProcessed("tochka", externalId, payload);
  
  return NextResponse.json({ status: "ok" });
}
```

**Verification:**
- [ ] Add ProcessedWebhook model
- [ ] Create migration
- [ ] Update webhook handlers
- [ ] Add tests for idempotency

---

### 0.4 CSRF Protection

**Problem:** Cookie-based auth without CSRF tokens is vulnerable to CSRF attacks.

**Solution:** Add CSRF token validation for mutating requests.

**Implementation:**

```typescript
// lib/shared/csrf.ts
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

export async function generateCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return token;
}

export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);
  
  if (!cookieToken || !headerToken) return false;
  
  return cookieToken === headerToken;
}
```

**Middleware integration:**
```typescript
// middleware.ts - Add CSRF check for mutating methods
if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
  // Skip CSRF for API routes that use other auth (webhooks, etc.)
  if (!pathname.startsWith("/api/webhooks") && 
      !pathname.startsWith("/api/auth")) {
    if (!await validateCsrfToken(request)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }
  }
}
```

**Client-side:**
```typescript
// lib/client/csrf.ts
let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const res = await fetch("/api/auth/csrf");
    const data = await res.json();
    csrfToken = data.token;
  }
  return csrfToken;
}

export async function fetchWithCsrf(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  const token = await getCsrfToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "x-csrf-token": token,
    },
  });
}
```

**Verification:**
- [ ] Create CSRF token generation endpoint
- [ ] Update middleware for CSRF validation
- [ ] Update client-side fetch helpers
- [ ] Add tests for CSRF protection

---

### 0.5 Rate Limiter for Production

**Problem:** In-memory rate limiter doesn't work with multiple instances.

**Solution:** Document the limitation and prepare for Redis-based solution.

**Immediate action:**
```typescript
// lib/shared/rate-limit.ts - Add warning comment
/**
 * ⚠️ WARNING: In-memory rate limiter
 * This implementation does NOT work across multiple server instances.
 * For production with multiple instances, use Redis-based solution.
 * 
 * Recommended: @upstash/ratelimit or similar
 */
```

**Future implementation (P2):**
```typescript
// lib/shared/rate-limit-redis.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});
```

**Verification:**
- [ ] Add warning comment to current implementation
- [ ] Document Redis requirement for production
- [ ] Create Upstash account and get credentials (for P2)

---

## Phase 1: Architecture Cleanup

**Priority:** High  
**Duration:** 4-6 weeks (revised from 3-4 weeks)  
**Risk Level:** Medium (refactoring required)

**⚠️ Warning:** This phase is ambitious. Consider focusing on the **core anchor** (Stock Movements + confirm refactor) first, then proceeding to domains and events.

### 1.1 Stock Movements as Source of Truth

**Problem:** `StockRecord` is a "magical aggregate" without audit trail.

**Solution:** Introduce `StockMovement` as immutable log, `StockRecord` as projection.

**Schema change:**
```prisma
model StockMovement {
  id             String   @id @default(cuid())
  documentId     String
  productId      String
  warehouseId    String
  quantity       Float    // Positive for IN, negative for OUT
  movementType   String   // "receipt" | "shipment" | "transfer_in" | "transfer_out" | "write_off" | "adjustment"
  averageCost    Float    // Cost at time of movement
  totalValue     Float    // quantity * averageCost
  createdAt      DateTime @default(now())
  
  document   Document  @relation(fields: [documentId], references: [id])
  product    Product   @relation(fields: [productId], references: [id])
  warehouse  Warehouse @relation(fields: [warehouseId], references: [id])
  
  @@index([warehouseId, productId, createdAt])
  @@index([documentId])
}

// Update existing models
model Product {
  // ... existing fields
  stockMovements StockMovement[]
}

model Warehouse {
  // ... existing fields
  stockMovements StockMovement[]
}
```

**Service implementation:**
```typescript
// lib/modules/inventory/stock-movement.service.ts
export class StockMovementService {
  /**
   * Create stock movements from a confirmed document.
   * This is the ONLY way to modify stock.
   */
  async createMovementsForDocument(
    tx: PrismaTx,
    document: DocumentWithItems
  ): Promise<StockMovement[]> {
    const movements: StockMovement[] = [];
    
    for (const item of document.items) {
      const movement = await tx.stockMovement.create({
        data: {
          documentId: document.id,
          productId: item.productId,
          warehouseId: document.warehouseId!,
          quantity: this.getQuantityForType(document.type, item.quantity),
          movementType: this.getMovementType(document.type),
          averageCost: item.price,
          totalValue: item.quantity * item.price,
        },
      });
      movements.push(movement);
    }
    
    return movements;
  }
  
  /**
   * Recalculate StockRecord from movements.
   * This is a projection, not the source of truth.
   */
  async recalculateProjection(
    tx: PrismaTx,
    warehouseId: string,
    productId: string
  ): Promise<StockRecord> {
    const result = await tx.stockMovement.aggregate({
      where: { warehouseId, productId },
      _sum: { quantity: true, totalValue: true },
    });
    
    const quantity = result._sum.quantity ?? 0;
    const totalValue = result._sum.totalValue ?? 0;
    const averageCost = quantity !== 0 ? totalValue / quantity : 0;
    
    return tx.stockRecord.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: { quantity, averageCost, totalCostValue: totalValue },
      create: { warehouseId, productId, quantity, averageCost, totalCostValue: totalValue },
    });
  }
  
  private getQuantityForType(type: DocumentType, qty: number): number {
    const increaseTypes = ["stock_receipt", "incoming_shipment", "customer_return"];
    return increaseTypes.includes(type) ? qty : -qty;
  }
  
  private getMovementType(type: DocumentType): string {
    const typeMap = {
      stock_receipt: "receipt",
      incoming_shipment: "receipt",
      customer_return: "receipt",
      write_off: "write_off",
      outgoing_shipment: "shipment",
      supplier_return: "shipment",
      stock_transfer: "transfer_out", // Handled separately
    };
    return typeMap[type] ?? "adjustment";
  }
}
```

**Update confirm flow:**
```typescript
// In document confirmation
await db.$transaction(async (tx) => {
  // 1. Update document status
  await tx.document.update({ where: { id }, data: { status: "confirmed" } });
  
  // 2. Create stock movements (immutable log)
  await stockMovementService.createMovementsForDocument(tx, document);
  
  // 3. Update projections
  for (const item of document.items) {
    await stockMovementService.recalculateProjection(tx, document.warehouseId, item.productId);
  }
});
```

**Verification:**
- [ ] Add StockMovement model
- [ ] Create migration
- [ ] Implement StockMovementService
- [ ] Update confirm/cancel flows
- [ ] Add tests for stock calculations
- [ ] Verify historical data can be reconstructed

---

### 1.2 Simplify confirm() Operation

**Problem:** `confirm()` does too many things synchronously.

**Solution:** Split into transactional core and async reactions.

**Before:**
```typescript
async function confirmDocument(docId) {
  // 300+ lines doing:
  // - validate
  // - update stock
  // - update average cost
  // - update counterparty balance
  // - create journal entry
  // - create payment
  // - send notifications
}
```

**After:**
```typescript
// lib/modules/accounting/services/document-confirm.service.ts
export class DocumentConfirmService {
  constructor(
    private stockService: StockMovementService,
    private ledgerService: LedgerService,
    private balanceService: CounterpartyBalanceService,
    private paymentService: PaymentService,
    private notificationService: NotificationService,
  ) {}
  
  /**
   * Core confirmation - transactional, must succeed or fail completely
   */
  async confirm(documentId: string, userId: string): Promise<Document> {
    // 1. Load and validate
    const document = await this.validateForConfirmation(documentId);
    
    // 2. Execute in transaction
    return db.$transaction(async (tx) => {
      // Update document status
      const confirmed = await tx.document.update({
        where: { id: documentId },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: userId,
        },
        include: { items: true },
      });
      
      // Core operations (must be in transaction)
      if (affectsStock(document.type)) {
        await this.stockService.createMovementsForDocument(tx, confirmed);
        await this.stockService.updateProjections(tx, confirmed);
      }
      
      return confirmed;
    });
  }
  
  /**
   * Post-confirmation effects - can be async, failures are non-critical
   */
  async postConfirmEffects(documentId: string): Promise<void> {
    const document = await db.document.findUnique({ 
      where: { id: documentId },
      include: { items: true }
    });
    if (!document) return;
    
    // These can fail without breaking the confirmation
    try {
      if (affectsBalance(document.type) && document.counterpartyId) {
        await this.balanceService.recalculate(document.counterpartyId);
      }
    } catch (error) {
      logger.error("document", "Failed to update balance", { documentId, error });
    }
    
    try {
      await this.ledgerService.autoPostDocument(documentId);
    } catch (error) {
      logger.error("document", "Failed to post ledger", { documentId, error });
    }
    
    try {
      if (shouldAutoCreatePayment(document.type)) {
        await this.paymentService.createForDocument(document);
      }
    } catch (error) {
      logger.error("document", "Failed to create payment", { documentId, error });
    }
  }
}
```

**API route:**
```typescript
// app/api/accounting/documents/[id]/confirm/route.ts
export async function POST(request: NextRequest, { params }: Params) {
  const user = await requirePermission("documents:confirm");
  const { id } = await params;
  
  const document = await documentConfirmService.confirm(id, user.id);
  
  // Fire and forget for non-critical effects
  documentConfirmService.postConfirmEffects(id).catch(err => {
    logger.error("document", "Post-confirm effects failed", { documentId: id, error: err });
  });
  
  return NextResponse.json(document);
}
```

**Verification:**
- [ ] Create DocumentConfirmService
- [ ] Split confirm logic
- [ ] Add error handling for non-critical effects
- [ ] Add tests for both paths
- [ ] Monitor for failed post-effects

---

### 1.3 State Machines for Documents and Orders

**Problem:** Document and order lifecycle is implicit and scattered across code.

**Solution:** Explicit state machine definitions with validated transitions.

**Document lifecycle states:**
```
draft → confirmed → shipped → delivered → closed
  ↓         ↓         ↓
cancelled cancelled cancelled
```

**Order lifecycle states:**
```
pending → processing → reserved → shipped → delivered → closed
   ↓          ↓          ↓          ↓
cancelled  cancelled  cancelled  cancelled
```

**Implementation:**
```typescript
// lib/modules/accounting/document-states.ts
import type { DocumentStatus, DocumentType } from "@/lib/generated/prisma/client";

interface StateTransition {
  from: DocumentStatus;
  to: DocumentStatus;
  allowedRoles?: ErpRole[];
  requires?: {
    hasItems?: boolean;
    hasWarehouse?: boolean;
    hasCounterparty?: boolean;
    stockAvailable?: boolean;
  };
}

const DOCUMENT_TRANSITIONS: Record<DocumentType, StateTransition[]> = {
  sales_order: [
    { from: "draft", to: "confirmed", requires: { hasItems: true, hasCounterparty: true } },
    { from: "confirmed", to: "shipped", requires: { stockAvailable: true } },
    { from: "shipped", to: "delivered" },
    { from: "delivered", to: "closed" },
    { from: "draft", to: "cancelled" },
    { from: "confirmed", to: "cancelled" },
  ],
  incoming_shipment: [
    { from: "draft", to: "confirmed", requires: { hasItems: true, hasWarehouse: true } },
    { from: "confirmed", to: "delivered" },
    { from: "draft", to: "cancelled" },
  ],
  stock_transfer: [
    { from: "draft", to: "confirmed", requires: { hasItems: true, hasWarehouse: true } },
    { from: "confirmed", to: "delivered" },
    { from: "draft", to: "cancelled" },
  ],
  inventory_count: [
    { from: "draft", to: "confirmed", requires: { hasItems: true, hasWarehouse: true } },
    { from: "draft", to: "cancelled" },
  ],
  // ... other document types
};

export function canTransition(
  documentType: DocumentType,
  currentStatus: DocumentStatus,
  targetStatus: DocumentStatus
): boolean {
  const transitions = DOCUMENT_TRANSITIONS[documentType] ?? [];
  return transitions.some(
    (t) => t.from === currentStatus && t.to === targetStatus
  );
}

export function validateTransition(
  document: { status: DocumentStatus; type: DocumentType; items: unknown[] },
  targetStatus: DocumentStatus
): { valid: boolean; error?: string } {
  if (!canTransition(document.type, document.status, targetStatus)) {
    return { valid: false, error: `Cannot transition from ${document.status} to ${targetStatus}` };
  }
  
  const transition = DOCUMENT_TRANSITIONS[document.type]?.find(
    (t) => t.from === document.status && t.to === targetStatus
  );
  
  if (transition?.requires?.hasItems && document.items.length === 0) {
    return { valid: false, error: "Document must have items" };
  }
  
  return { valid: true };
}

export function getAvailableTransitions(
  documentType: DocumentType,
  currentStatus: DocumentStatus
): DocumentStatus[] {
  const transitions = DOCUMENT_TRANSITIONS[documentType] ?? [];
  return transitions
    .filter((t) => t.from === currentStatus)
    .map((t) => t.to);
}
```

**Usage in API:**
```typescript
// In confirm endpoint
const validation = validateTransition(document, "confirmed");
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}

// In GET endpoint for UI
const availableTransitions = getAvailableTransitions(document.type, document.status);
// Returns: ["confirmed", "cancelled"] for draft
```

**Benefits:**
- Explicit lifecycle rules in one place
- Easy to test all transitions
- UI can show available actions
- Prevents invalid state changes
- Foundation for audit logging

**Verification:**
- [ ] Define state transitions for all document types
- [ ] Implement canTransition/validateTransition functions
- [ ] Update confirm/cancel/ship endpoints to use state machine
- [ ] Add API endpoint for available transitions
- [ ] Add tests for all transition combinations

---

### 1.4 Logical Domain Separation

**Problem:** `accounting` module is too broad.

**Solution:** Split into logical domains (code only, not DB schema).

**New structure:**
```
lib/modules/
├── catalog/
│   ├── index.ts
│   ├── services/
│   │   ├── product.service.ts
│   │   ├── category.service.ts
│   │   └── price.service.ts
│   └── schemas/
│       └── product.schemas.ts
├── inventory/
│   ├── index.ts
│   ├── services/
│   │   ├── stock.service.ts
│   │   ├── movement.service.ts
│   │   └── warehouse.service.ts
│   └── schemas/
├── sales/
│   ├── index.ts
│   ├── services/
│   │   ├── order.service.ts
│   │   ├── shipment.service.ts
│   │   └── customer-order.service.ts
│   └── schemas/
├── procurement/
│   ├── index.ts
│   ├── services/
│   │   ├── purchase.service.ts
│   │   └── supplier.service.ts
│   └── schemas/
├── finance/
│   ├── index.ts
│   ├── services/
│   │   ├── payment.service.ts
│   │   └── category.service.ts
│   └── schemas/
├── ledger/
│   ├── index.ts
│   ├── services/
│   │   ├── journal.service.ts
│   │   ├── posting.service.ts
│   │   └── account.service.ts
│   └── schemas/
├── identity/
│   ├── index.ts
│   ├── services/
│   │   ├── user.service.ts
│   │   └── customer.service.ts
│   └── schemas/
└── integrations/
    ├── index.ts
    ├── services/
    │   ├── telegram.service.ts
    │   └── payment-gateway.service.ts
    └── schemas/
```

**Migration strategy:**
1. Create new folder structure
2. Move existing code file by file
3. Update imports
4. Keep backward-compatible barrel exports in `accounting/index.ts`

```typescript
// lib/modules/accounting/index.ts - Backward compatibility
// These are now re-exports from new domains
export * from "../inventory";
export * from "../sales";
export * from "../ledger";
export * from "../procurement";
```

**Verification:**
- [ ] Create new folder structure
- [ ] Move catalog-related code
- [ ] Move inventory-related code
- [ ] Move sales-related code
- [ ] Move ledger-related code
- [ ] Update all imports
- [ ] Run all tests
- [ ] Update ESLint module boundaries

---

### 1.5 In-Process Domain Events

**Problem:** Direct coupling between modules.

**Solution:** Introduce domain events for loose coupling.

**⚠️ Important:** This is an **in-process event system**. Events are NOT persisted and handlers run synchronously. For durable/reliable delivery, see Phase 2 (Outbox Pattern).

**Event types:**
```typescript
// lib/shared/events/event-types.ts
export type DomainEvent =
  | DocumentConfirmedEvent
  | DocumentCancelledEvent
  | StockMovementCreatedEvent
  | PaymentReceivedEvent
  | OrderCreatedEvent;

export interface DocumentConfirmedEvent {
  type: "document.confirmed";
  payload: {
    documentId: string;
    documentType: DocumentType;
    warehouseId?: string;
    counterpartyId?: string;
    totalAmount: number;
    confirmedBy: string;
    confirmedAt: Date;
  };
}

export interface DocumentCancelledEvent {
  type: "document.cancelled";
  payload: {
    documentId: string;
    documentType: DocumentType;
    cancelledBy: string;
    cancelledAt: Date;
  };
}

export interface StockMovementCreatedEvent {
  type: "stock.movement";
  payload: {
    movementId: string;
    documentId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
  };
}

export interface PaymentReceivedEvent {
  type: "payment.received";
  payload: {
    documentId: string;
    amount: number;
    paymentMethod: string;
    externalId?: string;
  };
}
```

**Event bus (synchronous for now):**
```typescript
// lib/shared/events/event-bus.ts
type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;

const handlers = new Map<string, EventHandler<any>[]>();

export function subscribe<T extends DomainEvent>(
  eventType: T["type"],
  handler: EventHandler<T>
): () => void {
  if (!handlers.has(eventType)) {
    handlers.set(eventType, []);
  }
  handlers.get(eventType)!.push(handler);
  
  // Return unsubscribe function
  return () => {
    const eventHandlers = handlers.get(eventType) ?? [];
    const index = eventHandlers.indexOf(handler);
    if (index > -1) eventHandlers.splice(index, 1);
  };
}

export async function publish<T extends DomainEvent>(event: T): Promise<void> {
  const eventHandlers = handlers.get(event.type) ?? [];
  
  for (const handler of eventHandlers) {
    try {
      await handler(event);
    } catch (error) {
      logger.error("events", `Handler failed for ${event.type}`, { event, error });
      // Continue with other handlers
    }
  }
}
```

**Event handlers:**
```typescript
// lib/modules/ledger/handlers/document-confirmed.handler.ts
subscribe("document.confirmed", async (event) => {
  const { documentId, documentType } = event.payload;
  
  // Post ledger entries
  await ledgerService.autoPostDocument(documentId);
});

// lib/modules/finance/handlers/document-confirmed.handler.ts
subscribe("document.confirmed", async (event) => {
  const { documentId, documentType, counterpartyId } = event.payload;
  
  // Update counterparty balance
  if (counterpartyId && affectsBalance(documentType)) {
    await balanceService.recalculate(counterpartyId);
  }
  
  // Auto-create payment for shipments
  if (documentType === "incoming_shipment" || documentType === "outgoing_shipment") {
    await paymentService.createForDocument(documentId);
  }
});
```

**Publishing events:**
```typescript
// In document confirmation
await publish({
  type: "document.confirmed",
  payload: {
    documentId: document.id,
    documentType: document.type,
    warehouseId: document.warehouseId,
    counterpartyId: document.counterpartyId,
    totalAmount: document.totalAmount,
    confirmedBy: userId,
    confirmedAt: document.confirmedAt!,
  },
});
```

**Verification:**
- [ ] Create event types
- [ ] Implement event bus
- [ ] Create handlers for document.confirmed
- [ ] Create handlers for document.cancelled
- [ ] Update confirm/cancel to publish events
- [ ] Add tests for event flow

---

## Phase 2: Scalability Preparation

**Priority:** Medium  
**Duration:** 4-6 weeks  
**Risk Level:** Medium-High (significant changes)

### 2.1 Durable Event Delivery via Outbox

**Problem:** In-process events (Phase 1.5) are not persisted — can be lost on failure.

**Solution:** Implement outbox pattern for reliable, durable event delivery.

**Note:** This builds on the in-process events from Phase 1.5. The event types and handlers remain the same, but delivery becomes durable.

**Schema:**
```prisma
model OutboxEvent {
  id          String   @id @default(cuid())
  type        String
  payload     Json
  status      String   @default("pending") // "pending" | "processed" | "failed"
  attempts    Int      @default(0)
  lastError   String?
  createdAt   DateTime @default(now())
  processedAt DateTime?
  
  @@index([status, createdAt])
}
```

**Implementation:**
```typescript
// lib/shared/events/outbox.ts
export async function createOutboxEvent<T extends DomainEvent>(
  tx: PrismaTx,
  event: T
): Promise<OutboxEvent> {
  return tx.outboxEvent.create({
    data: {
      type: event.type,
      payload: event.payload,
      status: "pending",
    },
  });
}

export async function processOutboxEvents(): Promise<void> {
  const events = await db.outboxEvent.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  
  for (const event of events) {
    try {
      await publish({ type: event.type as any, payload: event.payload as any });
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: "processed", processedAt: new Date() },
      });
    } catch (error) {
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts >= 3 ? "failed" : "pending",
          attempts: event.attempts + 1,
          lastError: String(error),
        },
      });
    }
  }
}
```

**Integration:**
```typescript
// In transaction
await db.$transaction(async (tx) => {
  // Business logic
  await tx.document.update({ ... });
  await createStockMovements(tx, ...);
  
  // Create outbox event
  await createOutboxEvent(tx, {
    type: "document.confirmed",
    payload: { ... },
  });
});
```

**Background processor:**
```typescript
// app/api/cron/process-outbox/route.ts
// Called by cron job every minute
export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  await processOutboxEvents();
  return NextResponse.json({ status: "ok" });
}
```

**Verification:**
- [ ] Add OutboxEvent model
- [ ] Create migration
- [ ] Implement outbox service
- [ ] Update confirm flow to use outbox
- [ ] Create cron endpoint
- [ ] Add monitoring for failed events

---

### 2.2 Tenant-Ready Architecture Seams

**Problem:** No tenant isolation — can't serve multiple companies.

**Solution:** Prepare architecture seams for multi-tenancy WITHOUT full implementation yet.

**⚠️ Important:** Do NOT add tenant_id to all entities immediately. This is an expensive migration. Only implement after confirming product-market fit with 2-3 external clients.

**Phase 2 Scope (Preparation Only):**
1. Design tenant-aware auth model
2. Create Organization model (placeholder)
3. Design scoping strategy
4. Plan permission model changes
5. Document migration path

**Schema (placeholder, not yet used):**
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  plan      String   @default("trial") // "trial" | "basic" | "pro" | "enterprise"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  
  users         User[]
  products      Product[]
  warehouses    Warehouse[]
  counterparties Counterparty[]
  documents     Document[]
  // ... all other entities
}

// Update all entities
model Product {
  id        String   @id @default(cuid())
  tenantId  String
  // ... existing fields
  
  tenant Tenant @relation(fields: [tenantId], references: [id])
  
  @@index([tenantId])
}

// Same for: Warehouse, Counterparty, Document, StockRecord, etc.
```

**Tenant context:**
```typescript
// lib/shared/tenant-context.ts
import { AsyncLocalStorage } from "async_hooks";

interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function setTenantContext(context: TenantContext) {
  return tenantStorage.enterWith(context);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getTenantId(): string {
  const context = getTenantContext();
  if (!context) throw new Error("No tenant context");
  return context.tenantId;
}
```

**Prisma middleware:**
```typescript
// lib/shared/db.ts
const prismaClient = new PrismaClient({
  adapter,
}).$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, model, args, query }) {
        const tenantId = getTenantId();
        
        // Add tenant filter to all queries
        if (operation === "findMany" || operation === "findFirst") {
          args.where = { ...args.where, tenantId };
        }
        
        // Add tenant to all creates
        if (operation === "create") {
          args.data = { ...args.data, tenantId };
        }
        
        return query(args);
      },
    },
  },
});
```

**Verification:**
- [ ] Design tenant-aware auth model
- [ ] Create Tenant model (placeholder, no relations yet)
- [ ] Document scoping strategy
- [ ] Plan permission model changes
- [ ] Create migration plan for adding tenant_id later

**Deferred to Phase 3 or later:**
- Adding tenant_id to all entities
- Prisma extension for auto-filtering
- Row-level security
- Tenant-specific settings

---

### 2.3 Read Projections for Storefront

**Problem:** Storefront queries are complex and slow.

**Solution:** Create denormalized read models for common queries.

**Note:** The concept of read projections should be considered during Phase 1 (Stock Movements, Domain Separation) to avoid building everything on heavy transactional tables. This section implements them, but the planning starts earlier.

**Key Read Models to Plan:**
| Model | Purpose | Source Tables |
|-------|---------|---------------|
| ProductCatalogProjection | Storefront catalog | Product, SalePrice, Discount, StockRecord, Review |
| OrderListProjection | ERP order lists | Document, Customer, Counterparty |
| StockSummaryProjection | Inventory dashboard | StockRecord, StockMovement |
| SalesAnalyticsProjection | Reports | Document, DocumentItem, Payment |

**Schema:**
```prisma
model ProductCatalogProjection {
  id                String   @id
  tenantId          String
  productId         String
  
  // Denormalized data
  name              String
  slug              String?
  sku               String?
  imageUrl          String?
  categoryId        String?
  categoryName      String?
  
  // Price info
  basePrice         Float
  discountedPrice   Float?
  discountType      String?  // "percentage" | "fixed"
  discountValue     Float?
  
  // Stock info
  totalStock        Float
  isInStock         Boolean
  
  // Rating
  avgRating         Float    @default(0)
  reviewCount       Int      @default(0)
  
  // SEO
  seoTitle          String?
  seoDescription    String?
  
  // Timestamps
  updatedAt         DateTime @updatedAt
  
  @@unique([tenantId, productId])
  @@index([tenantId, categoryId])
  @@index([tenantId, isInStock])
  @@index([tenantId, avgRating])
}
```

**Projection update:**
```typescript
// lib/modules/catalog/projections/product-catalog.projection.ts
export async function updateProductCatalogProjection(productId: string): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      salePrices: { where: { isActive: true, priceListId: null }, take: 1 },
      discounts: { where: { isActive: true }, take: 1 },
      stockRecords: true,
      reviews: { where: { isPublished: true } },
    },
  });
  
  if (!product) return;
  
  const basePrice = product.salePrices[0]?.price ?? 0;
  const discount = product.discounts[0];
  const totalStock = product.stockRecords.reduce((sum, r) => sum + r.quantity, 0);
  const reviews = product.reviews;
  
  await db.productCatalogProjection.upsert({
    where: { tenantId_productId: { tenantId: getTenantId(), productId } },
    create: {
      tenantId: getTenantId(),
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      imageUrl: product.imageUrl,
      categoryId: product.categoryId,
      categoryName: product.category?.name,
      basePrice,
      discountedPrice: discount ? calculateDiscountedPrice(basePrice, discount) : null,
      discountType: discount?.type,
      discountValue: discount?.value,
      totalStock,
      isInStock: totalStock > 0,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
      reviewCount: reviews.length,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
    },
    update: { /* same fields */ },
  });
}
```

**Event handlers:**
```typescript
subscribe("product.updated", async (event) => {
  await updateProductCatalogProjection(event.payload.productId);
});

subscribe("stock.movement", async (event) => {
  await updateProductCatalogProjection(event.payload.productId);
});

subscribe("review.published", async (event) => {
  await updateProductCatalogProjection(event.payload.productId);
});
```

**Storefront query:**
```typescript
// app/api/ecommerce/products/route.ts
const products = await db.productCatalogProjection.findMany({
  where: {
    tenantId: getTenantId(),
    isInStock: true,
    ...(categoryId && { categoryId }),
  },
  orderBy: { [sortBy]: sortOrder },
  skip: (page - 1) * limit,
  take: limit,
});
```

**Verification:**
- [ ] Add ProductCatalogProjection model
- [ ] Create migration
- [ ] Implement projection update service
- [ ] Create event handlers
- [ ] Update storefront API to use projections
- [ ] Add cron job to rebuild projections (safety net)

---

### 2.4 Redis Rate Limiter

**Problem:** In-memory rate limiter doesn't scale.

**Solution:** Use Upstash Redis for distributed rate limiting.

**Implementation:**
```typescript
// lib/shared/rate-limit-redis.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Different limiters for different use cases
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"), // 5 attempts per 15 min
  prefix: "auth",
});

export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per min
  prefix: "api",
});

export const checkoutLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 checkouts per hour
  prefix: "checkout",
});
```

**Usage:**
```typescript
// In API route
const identifier = getClientIp(request);
const { success, limit, reset, remaining } = await apiLimiter.limit(identifier);

if (!success) {
  return NextResponse.json(
    { error: "Too many requests" },
    { 
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
      },
    }
  );
}
```

**Verification:**
- [ ] Create Upstash account
- [ ] Add environment variables
- [ ] Implement Redis rate limiter
- [ ] Update middleware to use new limiter
- [ ] Remove in-memory implementation
- [ ] Add tests for rate limiting

---

## Phase 3: Maturity

**Priority:** Lower  
**Duration:** Ongoing  
**Risk Level:** Low

### 3.1 Scenario Tests

**What to test:**
- Complete order flow (cart → checkout → payment → shipment → delivery)
- Document lifecycle (draft → confirmed → shipped → delivered)
- Stock movements and projections
- Ledger posting and balancing
- Payment reconciliation

**Example:**
```typescript
// tests/scenarios/order-flow.test.ts
describe("Order Flow", () => {
  it("should complete full order lifecycle", async () => {
    // 1. Customer adds to cart
    await addToCart(customer.id, product.id, null, 2, 100);
    
    // 2. Customer checks out
    const order = await createSalesOrderFromCart({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2, price: 100 }],
      deliveryType: "pickup",
    });
    
    // 3. Payment received
    await confirmOrderPayment({
      documentId: order.documentId,
      paymentExternalId: "pay_123",
      paymentMethod: "tochka",
    });
    
    // 4. Verify stock reserved/moved
    const stock = await getProductStock(warehouse.id, product.id);
    expect(stock).toBe(initialStock - 2);
    
    // 5. Verify ledger entry created
    const entries = await getEntriesForDocument(order.documentId);
    expect(entries).toHaveLength(1);
    expect(entries[0].lines).toBeDefined();
    
    // 6. Verify balance updated
    const balance = await getCounterpartyBalance(counterparty.id);
    expect(balance).toBe(200);
  });
});
```

### 3.2 Invariant Tests

**What to test:**
- Stock never goes negative without override
- Document can't be confirmed twice
- Journal entries are always balanced
- Payments are never double-applied
- Cancel reverses all effects

### 3.3 Performance Monitoring

**What to add:**
- Query logging with duration
- Slow query alerts
- API response time tracking
- Error rate monitoring

### 3.4 Audit Logging

**Schema:**
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String?
  action    String   // "document.confirm", "user.login", etc.
  entityType String
  entityId  String
  oldValue  Json?
  newValue  Json?
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  
  @@index([tenantId, entityType, entityId])
  @@index([tenantId, userId, createdAt])
}
```

---

## Implementation Timeline

| Phase | Duration | Start | Key Deliverables |
|-------|----------|-------|------------------|
| P0 | 1 week | Immediate | Migrations, logging, CSRF, webhook idempotency |
| 1.1 | 1 week | Week 2 | Stock movements model |
| 1.2 | 1 week | Week 3 | Simplified confirm() |
| 1.3 | 1 week | Week 4 | State machines for documents |
| 1.4 | 1 week | Week 5 | Logical domain separation |
| 1.5 | 1 week | Week 6 | In-process domain events |
| 2.1 | 1 week | Week 7 | Durable delivery via outbox |
| 2.2 | 1 week | Week 8 | Tenant-ready seams (planning only) |
| 2.3 | 1 week | Week 9 | Read projections |
| 2.4 | 1 week | Week 10 | Redis rate limiter |
| P3 | Ongoing | Week 11+ | Tests, monitoring, audit |

**Note:** Phase 1 is ambitious at 5 weeks. Consider focusing on the **core anchor** (1.1 + 1.2) first, then proceeding to 1.3-1.5.

---

## Success Metrics

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Test coverage | ~60% | 80%+ | P3 |
| API response time (p95) | Unknown | <200ms | P2 |
| Error rate | Unknown | <0.1% | P0 |
| Deployment safety | db push | migrations | P0 |
| Multi-tenant ready | No | Seams prepared | P2 |
| Event traceability | None | Full (outbox) | P2 |
| State machine coverage | None | All documents | P1 |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing flows | Medium | High | Comprehensive tests before changes |
| Performance regression | Medium | Medium | Benchmark before/after |
| Data migration issues | Low | High | Test on staging, have rollback plan |
| Team adoption | Medium | Medium | Document changes, pair programming |
| Scope creep | High | Medium | Stick to phased approach |
| Phase 1 overload | High | Medium | Focus on core anchor (Stock Movements + confirm) first |
| Premature multi-tenant | Medium | High | Only prepare seams, defer full implementation |

---

## Appendix A: File Changes Summary

### P0 Changes
- `.github/workflows/ci.yml` — Migration instead of db push
- `prisma/schema.prisma` — Add ProcessedWebhook
- `lib/shared/csrf.ts` — New file
- `lib/shared/webhook-idempotency.ts` — New file
- `middleware.ts` — CSRF validation
- 15+ API route files — Replace console.error with logger

### P1 Changes
- `prisma/schema.prisma` — Add StockMovement
- `lib/modules/accounting/document-states.ts` — State machine definitions
- `lib/modules/inventory/` — New module
- `lib/modules/sales/` — New module
- `lib/modules/ledger/` — New module
- `lib/shared/events/` — New directory (in-process events)
- `app/api/accounting/documents/[id]/confirm/route.ts` — Refactor

### P2 Changes
- `prisma/schema.prisma` — Add Tenant (placeholder), OutboxEvent, ProductCatalogProjection
- `lib/shared/tenant-context.ts` — New file (planning only)
- `lib/shared/rate-limit-redis.ts` — New file
- `lib/shared/events/outbox.ts` — Durable event delivery

---

## Appendix B: Backward Compatibility

All changes maintain backward compatibility through:

1. **Barrel exports** — Old import paths still work
2. **Database migrations** — No data loss
3. **API contracts** — No breaking changes to endpoints
4. **Feature flags** — New features can be toggled

---

*End of Specification*

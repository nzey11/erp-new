# Accounting Module

<cite>
**Referenced Files in This Document**
- [app/(accounting)/layout.tsx](file://app/(accounting)/layout.tsx)
- [app/(accounting)/page.tsx](file://app/(accounting)/page.tsx)
- [app/api/accounting/documents/route.ts](file://app/api/accounting/documents/route.ts)
- [app/api/accounting/documents/[id]/route.ts](file://app/api/accounting/documents/[id]/route.ts)
- [app/api/accounting/documents/[id]/confirm/route.ts](file://app/api/accounting/documents/[id]/confirm/route.ts)
- [app/api/accounting/documents/bulk-confirm/route.ts](file://app/api/accounting/documents/bulk-confirm/route.ts)
- [components/accounting/CreateDocumentDialog.tsx](file://components/accounting/CreateDocumentDialog.tsx)
- [lib/modules/accounting/services/document-confirm.service.ts](file://lib/modules/accounting/services/document-confirm.service.ts)
- [lib/modules/accounting/document-states.ts](file://lib/modules/accounting/document-states.ts)
- [lib/modules/accounting/documents.ts](file://lib/modules/accounting/documents.ts)
- [lib/modules/accounting/schemas/documents.schema.ts](file://lib/modules/accounting/schemas/documents.schema.ts)
- [lib/modules/accounting/inventory/predicates.ts](file://lib/modules/accounting/inventory/predicates.ts)
- [lib/modules/accounting/inventory/stock.ts](file://lib/modules/accounting/inventory/stock.ts)
- [lib/modules/accounting/inventory/stock-movements.ts](file://lib/modules/accounting/inventory/stock-movements.ts)
- [lib/modules/accounting/finance/cogs.ts](file://lib/modules/accounting/finance/cogs.ts)
- [app/api/accounting/stock/route.ts](file://app/api/accounting/stock/route.ts)
- [app/api/accounting/counterparties/route.ts](file://app/api/accounting/counterparties/route.ts)
- [app/api/accounting/counterparties/[id]/route.ts](file://app/api/accounting/counterparties/[id]/route.ts)
- [components/accounting/CounterpartiesTable.tsx](file://components/accounting/CounterpartiesTable.tsx)
- [app/api/accounting/warehouses/route.ts](file://app/api/accounting/warehouses/route.ts)
- [app/api/accounting/units/route.ts](file://app/api/accounting/units/route.ts)
- [app/api/accounting/price-lists/route.ts](file://app/api/accounting/price-lists/route.ts)
- [lib/modules/accounting/balance.ts](file://lib/modules/accounting/balance.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [vitest.config.ts](file://vitest.config.ts)
- [vitest.integration.config.ts](file://vitest.integration.config.ts)
- [vitest.unit.config.ts](file://vitest.unit.config.ts)
- [vitest.service.config.ts](file://vitest.service.config.ts)
- [tests/setup.ts](file://tests/setup.ts)
- [tests/helpers/test-db.ts](file://tests/helpers/test-db.ts)
- [tests/integration/api/documents.test.ts](file://tests/integration/api/documents.test.ts)
- [tests/unit/lib/documents.test.ts](file://tests/unit/lib/documents.test.ts)
- [tests/unit/lib/stock-movements.test.ts](file://tests/unit/lib/stock-movements.test.ts)
- [package.json](file://package.json)
</cite>

## Update Summary
**Changes Made**
- Enhanced testing infrastructure documentation with detailed Vitest configuration breakdown
- Added comprehensive coverage of the multi-tier testing strategy (unit, service, integration)
- Updated test execution patterns and configuration options
- Documented database cleanup and isolation mechanisms
- Added testing best practices and troubleshooting guidance

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Testing Infrastructure](#testing-infrastructure)
6. [Detailed Component Analysis](#detailed-component-analysis)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)
11. [Appendices](#appendices)

## Introduction
The Accounting module is the core business engine of ListOpt ERP, responsible for managing inventory, documents, and financial transactions. Following a major restructuring, the module now features a comprehensive document confirmation service with transactional guarantees, centralized state management, and domain-specific organization for inventory and finance operations.

The module orchestrates the lifecycle of 11 document types across four primary domains:
- Stock operations: stock receipt, transfer, write-off, inventory count
- Purchase operations: purchase order, incoming shipment, supplier return
- Sales operations: sales order, outgoing shipment, customer return
- Payment operations: incoming and outgoing payments

It provides real-time stock tracking with moving average cost calculations, multi-warehouse support, counterparty relationship management, and a robust reference data system for units, categories, price lists, and warehouses. The module integrates with the Finance module for balances and chart-of-accounts posting, and exposes APIs for reporting and audit trails.

**Updated** The module now features a transactional document confirmation service that ensures atomicity across stock movements, cost calculations, and document state changes, along with a centralized state machine for consistent status transitions. The testing infrastructure has been enhanced with a comprehensive multi-tier approach covering unit, service, and integration testing.

## Project Structure
The module is organized by feature areas under the accounting namespace with domain-specific submodules:
- UI pages and dashboards: app/(accounting)/*
- API routes: app/api/accounting/* (documents, stock, counterparties, references)
- Domain services: lib/modules/accounting/*
  - Services: lib/modules/accounting/services/*
  - Inventory domain: lib/modules/accounting/inventory/*
  - Finance domain: lib/modules/accounting/finance/*
- Shared logic and schemas: lib/modules/accounting/*
- Data model: prisma/schema.prisma

```mermaid
graph TB
subgraph "UI Layer"
L["Layout<br/>app/(accounting)/layout.tsx"]
D["Dashboard<br/>app/(accounting)/page.tsx"]
CDD["CreateDocumentDialog<br/>components/accounting/CreateDocumentDialog.tsx"]
CT["CounterpartiesTable<br/>components/accounting/CounterpartiesTable.tsx"]
end
subgraph "API Layer"
DOC["Documents API<br/>app/api/accounting/documents/*.ts"]
CONF["Confirmation API<br/>app/api/accounting/documents/*/confirm/*.ts"]
STOCK["Stock API<br/>app/api/accounting/stock/route.ts"]
CP["Counterparties API<br/>app/api/accounting/counterparties/*.ts"]
W["Warehouses API<br/>app/api/accounting/warehouses/route.ts"]
U["Units API<br/>app/api/accounting/units/route.ts"]
PL["Price Lists API<br/>app/api/accounting/price-lists/route.ts"]
end
subgraph "Domain Services"
DOCUTIL["Document Utilities<br/>lib/modules/accounting/documents.ts"]
STATES["State Machine<br/>lib/modules/accounting/document-states.ts"]
CONFIRM["Document Confirmation Service<br/>lib/modules/accounting/services/document-confirm.service.ts"]
INV["Inventory Predicates<br/>lib/modules/accounting/inventory/predicates.ts"]
STOCKOPS["Stock Operations<br/>lib/modules/accounting/inventory/stock.ts"]
MOVEMENTS["Stock Movements<br/>lib/modules/accounting/inventory/stock-movements.ts"]
COGS["COGS Calculation<br/>lib/modules/accounting/finance/cogs.ts"]
end
subgraph "Data Model"
PRISMA["Prisma Schema<br/>prisma/schema.prisma"]
end
L --> D
D --> DOC
D --> CONF
D --> STOCK
D --> CP
CDD --> DOC
CT --> CP
DOC --> DOCUTIL
CONF --> CONFIRM
CONFIRM --> STATES
CONFIRM --> INV
CONFIRM --> STOCKOPS
CONFIRM --> MOVEMENTS
CP --> COGS
DOC --- PRISMA
CONF --- PRISMA
STOCK --- PRISMA
CP --- PRISMA
W --- PRISMA
U --- PRISMA
PL --- PRISMA
```

**Diagram sources**
- [app/(accounting)/layout.tsx:1-24](file://app/(accounting)/layout.tsx#L1-L24)
- [app/(accounting)/page.tsx:1-273](file://app/(accounting)/page.tsx#L1-L273)
- [components/accounting/CreateDocumentDialog.tsx:1-244](file://components/accounting/CreateDocumentDialog.tsx#L1-L244)
- [components/accounting/CounterpartiesTable.tsx:1-190](file://components/accounting/CounterpartiesTable.tsx#L1-L190)
- [app/api/accounting/documents/route.ts:1-136](file://app/api/accounting/documents/route.ts#L1-L136)
- [app/api/accounting/documents/[id]/confirm/route.ts:1-34](file://app/api/accounting/documents/[id]/confirm/route.ts#L1-L34)
- [app/api/accounting/documents/bulk-confirm/route.ts:1-100](file://app/api/accounting/documents/bulk-confirm/route.ts#L1-L100)
- [app/api/accounting/stock/route.ts:1-192](file://app/api/accounting/stock/route.ts#L1-L192)
- [app/api/accounting/counterparties/route.ts:1-81](file://app/api/accounting/counterparties/route.ts#L1-L81)
- [app/api/accounting/counterparties/[id]/route.ts:1-87](file://app/api/accounting/counterparties/[id]/route.ts#L1-L87)
- [app/api/accounting/warehouses/route.ts:1-45](file://app/api/accounting/warehouses/route.ts#L1-L45)
- [app/api/accounting/units/route.ts:1-39](file://app/api/accounting/units/route.ts#L1-L39)
- [app/api/accounting/price-lists/route.ts:1-40](file://app/api/accounting/price-lists/route.ts#L1-L40)
- [lib/modules/accounting/documents.ts:1-37](file://lib/modules/accounting/documents.ts#L1-L37)
- [lib/modules/accounting/document-states.ts:1-155](file://lib/modules/accounting/document-states.ts#L1-L155)
- [lib/modules/accounting/services/document-confirm.service.ts:1-637](file://lib/modules/accounting/services/document-confirm.service.ts#L1-L637)
- [lib/modules/accounting/inventory/predicates.ts:1-55](file://lib/modules/accounting/inventory/predicates.ts#L1-L55)
- [lib/modules/accounting/inventory/stock.ts:1-39](file://lib/modules/accounting/inventory/stock.ts#L1-L39)
- [lib/modules/accounting/inventory/stock-movements.ts:1-30](file://lib/modules/accounting/inventory/stock-movements.ts#L1-L30)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)
- [prisma/schema.prisma:1-1064](file://prisma/schema.prisma#L1-L1064)

**Section sources**
- [app/(accounting)/layout.tsx:1-24](file://app/(accounting)/layout.tsx#L1-L24)
- [app/(accounting)/page.tsx:1-273](file://app/(accounting)/page.tsx#L1-L273)

## Core Components
- **Document engine**: creation, querying, editing, and linking of 11 document types with status transitions and numbering.
- **Transaction-safe document confirmation**: atomic confirmation service ensuring stock movements, cost calculations, and state changes occur together.
- **Centralized state management**: unified state machine controlling all document status transitions across domains.
- **Enhanced stock management**: real-time tracking per warehouse/product with moving average cost, reserve calculation, and inventory adjustment workflow.
- **Domain-specific organization**: inventory and finance modules separated for better maintainability and scalability.
- **Counterparty management**: customer/supplier relationship lifecycle with balances and interaction history.
- **Reference data**: units, product categories, price lists, and warehouses.
- **Integration points**: Finance module for balances and chart-of-accounts posting; e-commerce for order-to-document synchronization.
- **Comprehensive testing infrastructure**: multi-tier testing approach with unit, service, and integration test configurations.

**Updated** Added comprehensive testing infrastructure with separate Vitest configurations for different test types, ensuring proper isolation and execution patterns for various testing scenarios.

**Section sources**
- [lib/modules/accounting/services/document-confirm.service.ts:244-350](file://lib/modules/accounting/services/document-confirm.service.ts#L244-L350)
- [lib/modules/accounting/document-states.ts:114-155](file://lib/modules/accounting/document-states.ts#L114-L155)
- [lib/modules/accounting/inventory/stock.ts:15-39](file://lib/modules/accounting/inventory/stock.ts#L15-L39)
- [lib/modules/accounting/inventory/stock-movements.ts:1-30](file://lib/modules/accounting/inventory/stock-movements.ts#L1-L30)
- [lib/modules/accounting/documents.ts:17-32](file://lib/modules/accounting/documents.ts#L17-L32)
- [app/api/accounting/documents/route.ts:1-136](file://app/api/accounting/documents/route.ts#L1-L136)
- [app/api/accounting/stock/route.ts:1-192](file://app/api/accounting/stock/route.ts#L1-L192)
- [app/api/accounting/counterparties/route.ts:1-81](file://app/api/accounting/counterparties/route.ts#L1-L81)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)

## Architecture Overview
The module follows a layered architecture with domain-specific organization:
- UI layer: Next.js app directory pages and shared components.
- API layer: Next.js API routes implementing CRUD and domain workflows.
- Domain services: specialized services for document confirmation, inventory management, and financial calculations.
- State management: centralized state machine controlling all document transitions.
- Persistence: Prisma ORM mapping to PostgreSQL.

```mermaid
graph TB
UI["UI Pages<br/>app/(accounting)/*"] --> API["API Routes<br/>app/api/accounting/*"]
API --> SERVICES["Domain Services<br/>lib/modules/accounting/services/*"]
API --> CONFIRM["Document Confirmation<br/>lib/modules/accounting/services/document-confirm.service.ts"]
SERVICES --> STATES["State Machine<br/>lib/modules/accounting/document-states.ts"]
SERVICES --> INVENTORY["Inventory Domain<br/>lib/modules/accounting/inventory/*"]
SERVICES --> FINANCE["Finance Domain<br/>lib/modules/accounting/finance/*"]
API --> DB["Prisma Models<br/>prisma/schema.prisma"]
CONFIRM --> DB
INVENTORY --> DB
FINANCE --> DB
STATES --> DB
DB --> PG["PostgreSQL"]
```

**Diagram sources**
- [app/(accounting)/page.tsx:1-273](file://app/(accounting)/page.tsx#L1-L273)
- [app/api/accounting/documents/route.ts:1-136](file://app/api/accounting/documents/route.ts#L1-L136)
- [lib/modules/accounting/services/document-confirm.service.ts:1-637](file://lib/modules/accounting/services/document-confirm.service.ts#L1-L637)
- [lib/modules/accounting/document-states.ts:1-155](file://lib/modules/accounting/document-states.ts#L1-L155)
- [lib/modules/accounting/inventory/predicates.ts:1-55](file://lib/modules/accounting/inventory/predicates.ts#L1-L55)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [prisma/schema.prisma:1-1064](file://prisma/schema.prisma#L1-L1064)

## Testing Infrastructure

The Accounting module employs a comprehensive multi-tier testing strategy using Vitest with specialized configurations for different testing scenarios:

### Test Configuration Hierarchy

```mermaid
graph TB
subgraph "Vitest Configuration Hierarchy"
ROOT["vitest.config.ts<br/>Base configuration"] --> UNIT["vitest.unit.config.ts<br/>Pure unit tests"]
ROOT --> SERVICE["vitest.service.config.ts<br/>Service-level tests"]
ROOT --> INTEGRATION["vitest.integration.config.ts<br/>Full integration tests"]
END
subgraph "Test Categories"
UNIT --> UNIT_TESTS["tests/unit/**/*"]
SERVICE --> SERVICE_TESTS["tests/unit/lib/* (DB-backed)"]
INTEGRATION --> INTEGRATION_TESTS["tests/integration/**/*"]
END
subgraph "Execution Scripts"
NPM["package.json scripts"] --> TEST_ALL["test:all"]
NPM --> TEST_UNIT["test:unit"]
NPM --> TEST_SERVICE["test:service"]
NPM --> TEST_INTEGRATION["test:integration"]
END
```

**Diagram sources**
- [vitest.config.ts:1-30](file://vitest.config.ts#L1-L30)
- [vitest.unit.config.ts:1-34](file://vitest.unit.config.ts#L1-L34)
- [vitest.service.config.ts:1-40](file://vitest.service.config.ts#L1-L40)
- [vitest.integration.config.ts:1-36](file://vitest.integration.config.ts#L1-L36)
- [package.json:5-33](file://package.json#L5-L33)

### Base Configuration (`vitest.config.ts`)
The root configuration establishes global testing settings including environment setup, timeout values, and parallelization controls. It serves as the foundation for all other test configurations.

### Unit Test Configuration (`vitest.unit.config.ts`)
Focused on pure unit tests that don't require database access. Excludes specific service tests that need database connectivity and allows parallel execution for faster feedback.

### Service Test Configuration (`vitest.service.config.ts`)
Targets business logic functions that require database access. These tests validate service-level operations against a real test database with sequential execution to prevent race conditions.

### Integration Test Configuration (`vitest.integration.config.ts`)
The most comprehensive test suite running against a real test database with full data flows. Includes repository queries, transaction boundaries, and API route handlers with strict sequential execution.

### Database Management and Isolation
The testing infrastructure includes sophisticated database management through helper utilities:

```mermaid
sequenceDiagram
participant SETUP as "Test Setup"
participant CLEAN as "cleanDatabase()"
participant DB as "Test Database"
SETUP->>CLEAN : Initialize test environment
CLEAN->>DB : Delete in FK dependency order
CLEAN->>DB : Clear all test data
SETUP->>DB : Create test fixtures
SETUP->>SETUP : Execute test suite
SETUP->>DB : Cleanup after tests
```

**Diagram sources**
- [tests/helpers/test-db.ts:1-75](file://tests/helpers/test-db.ts#L1-L75)
- [tests/setup.ts:1-26](file://tests/setup.ts#L1-L26)

**Section sources**
- [vitest.config.ts:1-30](file://vitest.config.ts#L1-L30)
- [vitest.unit.config.ts:1-34](file://vitest.unit.config.ts#L1-L34)
- [vitest.service.config.ts:1-40](file://vitest.service.config.ts#L1-L40)
- [vitest.integration.config.ts:1-36](file://vitest.integration.config.ts#L1-L36)
- [tests/helpers/test-db.ts:1-75](file://tests/helpers/test-db.ts#L1-L75)
- [tests/setup.ts:1-26](file://tests/setup.ts#L1-L26)
- [package.json:5-33](file://package.json#L5-L33)

## Detailed Component Analysis

### Document Confirmation Service
The transaction-safe document confirmation service ensures atomicity across all document confirmation operations. It validates documents, creates stock movements, updates projections, calculates costs, and marks documents confirmed in a strict sequence.

```mermaid
sequenceDiagram
participant UI as "UI/API"
participant CONFIRM as "DocumentConfirmService"
participant DB as "Database"
participant STOCK as "Stock System"
participant OUTBOX as "Outbox Event"
UI->>CONFIRM : confirmDocumentTransactional(id, actor)
CONFIRM->>DB : Load document + items
CONFIRM->>CONFIRM : validateForConfirmation()
alt Stock document
CONFIRM->>STOCK : createMovementsForDocument()
CONFIRM->>STOCK : updateAverageCostForDocument()
alt Inventory count
CONFIRM->>DB : createInventoryAdjustments()
end
end
CONFIRM->>DB : Update document status to "confirmed"
CONFIRM->>OUTBOX : createOutboxEvent("DocumentConfirmed")
CONFIRM-->>UI : Confirmed document result
```

**Diagram sources**
- [lib/modules/accounting/services/document-confirm.service.ts:244-350](file://lib/modules/accounting/services/document-confirm.service.ts#L244-L350)
- [lib/modules/accounting/services/document-confirm.service.ts:99-160](file://lib/modules/accounting/services/document-confirm.service.ts#L99-L160)
- [lib/modules/accounting/services/document-confirm.service.ts:262-297](file://lib/modules/accounting/services/document-confirm.service.ts#L262-L297)

Key features:
- **Atomic operations**: All confirmation steps occur within a single database transaction
- **Strict ordering**: Stock movements, cost updates, and state changes happen in a defined sequence
- **Idempotent operations**: Stock movements and reversals are designed to be safe across retries
- **Inventory adjustments**: Automatic creation of write-off and stock-receipt documents for inventory discrepancies
- **Event-driven architecture**: Outbox pattern ensures post-confirmation handlers are triggered reliably

**Section sources**
- [lib/modules/accounting/services/document-confirm.service.ts:244-350](file://lib/modules/accounting/services/document-confirm.service.ts#L244-L350)
- [lib/modules/accounting/services/document-confirm.service.ts:99-160](file://lib/modules/accounting/services/document-confirm.service.ts#L99-L160)
- [lib/modules/accounting/services/document-confirm.service.ts:496-636](file://lib/modules/accounting/services/document-confirm.service.ts#L496-L636)

### Centralized State Management
The document state machine provides a single source of truth for all document status transitions across all domains. It defines allowed transitions and validates state changes before any business logic executes.

```mermaid
classDiagram
class DocumentStateError {
+DocumentType documentType
+DocumentStatus fromStatus
+DocumentStatus toStatus
+string reason
+constructor(type, from, to, reason)
}
class StateMachine {
+canTransition(type, from, to) boolean
+validateTransition(type, from, to) void
+getAvailableTransitions(type, status) DocumentStatus[]
}
class TransitionTable {
<<static>>
+Record~DocumentType, TransitionMap~ TRANSITIONS
}
StateMachine --> DocumentStateError : throws
StateMachine --> TransitionTable : uses
```

**Diagram sources**
- [lib/modules/accounting/document-states.ts:22-34](file://lib/modules/accounting/document-states.ts#L22-L34)
- [lib/modules/accounting/document-states.ts:114-155](file://lib/modules/accounting/document-states.ts#L114-L155)
- [lib/modules/accounting/document-states.ts:45-104](file://lib/modules/accounting/document-states.ts#L45-L104)

**Updated** The state machine now covers all document types including sales orders with extended lifecycle (draft → confirmed → shipped → delivered) and inventory counts with specialized validation.

**Section sources**
- [lib/modules/accounting/document-states.ts:1-155](file://lib/modules/accounting/document-states.ts#L1-L155)
- [app/api/accounting/documents/[id]/confirm/route.ts:12-34](file://app/api/accounting/documents/[id]/confirm/route.ts#L12-L34)

### Enhanced Stock Management
Real-time stock tracking maintains per-warehouse, per-product quantities and moving average costs with improved accuracy and performance. The system now includes automatic inventory adjustment creation and enhanced cost calculation methods.

```mermaid
flowchart TD
Start(["GET /api/accounting/stock"]) --> Parse["Parse query params"]
Parse --> BuildWhere["Build WHERE conditions"]
BuildWhere --> FetchRecords["Fetch stock records"]
FetchRecords --> Mode{"Enhanced mode?"}
Mode --> |No| Legacy["Aggregate totals per product"]
Mode --> |Yes| DraftOutgoing["Find draft outgoing items per product:warehouse"]
DraftOutgoing --> PurchasePrices["Latest active purchase prices"]
PurchasePrices --> SalePrices["Latest default sale prices"]
SalePrices --> Enrich["Enrich records:<br/>reserve, available,<br/>averageCost, values"]
Enrich --> Totals["Compute totals"]
Legacy --> Return["Return records + totals"]
Totals --> Return
Return --> End(["Response"])
```

**Diagram sources**
- [app/api/accounting/stock/route.ts:1-192](file://app/api/accounting/stock/route.ts#L1-L192)

Business rules:
- **Reserve calculation**: Sum of quantities in draft outgoing documents grouped by product and warehouse
- **Available stock**: Quantity minus reserve with real-time updates
- **Cost calculation**: Moving average from stock records with fallback to latest purchase price
- **Inventory adjustments**: Automatic creation of write-off and stock-receipt documents for inventory discrepancies
- **COGS tracking**: Accurate cost of goods sold calculation using stock records and ledger entries

**Section sources**
- [app/api/accounting/stock/route.ts:1-192](file://app/api/accounting/stock/route.ts#L1-L192)
- [lib/modules/accounting/inventory/stock.ts:15-39](file://lib/modules/accounting/inventory/stock.ts#L15-L39)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)

### Domain-Specific Organization
The module has been restructured into domain-specific submodules for better maintainability and scalability:

- **Inventory domain**: Stock management, movement tracking, and cost calculations
- **Finance domain**: COGS calculation, balance management, and financial reporting
- **Services**: Transaction-safe document operations and business logic
- **Predicates**: Document type classifications and business rule definitions

```mermaid
graph LR
subgraph "Accounting Module"
ACCOUNTING["Accounting Root<br/>lib/modules/accounting/"]
subgraph "Inventory Domain"
PRED["Predicates<br/>inventory/predicates.ts"]
STOCK["Stock Operations<br/>inventory/stock.ts"]
MOVES["Stock Movements<br/>inventory/stock-movements.ts"]
END
subgraph "Finance Domain"
COGS["COGS Calculation<br/>finance/cogs.ts"]
END
subgraph "Services"
CONF["Document Confirmation<br/>services/document-confirm.service.ts"]
STATES["State Machine<br/>document-states.ts"]
END
ACCOUNTING --> PRED
ACCOUNTING --> STOCK
ACCOUNTING --> MOVES
ACCOUNTING --> COGS
ACCOUNTING --> CONF
ACCOUNTING --> STATES
```

**Diagram sources**
- [lib/modules/accounting/inventory/predicates.ts:1-55](file://lib/modules/accounting/inventory/predicates.ts#L1-L55)
- [lib/modules/accounting/inventory/stock.ts:1-39](file://lib/modules/accounting/inventory/stock.ts#L1-L39)
- [lib/modules/accounting/inventory/stock-movements.ts:1-30](file://lib/modules/accounting/inventory/stock-movements.ts#L1-L30)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [lib/modules/accounting/services/document-confirm.service.ts:1-637](file://lib/modules/accounting/services/document-confirm.service.ts#L1-L637)
- [lib/modules/accounting/document-states.ts:1-155](file://lib/modules/accounting/document-states.ts#L1-L155)

**Section sources**
- [lib/modules/accounting/inventory/predicates.ts:1-55](file://lib/modules/accounting/inventory/predicates.ts#L1-L55)
- [lib/modules/accounting/inventory/stock.ts:1-39](file://lib/modules/accounting/inventory/stock.ts#L1-L39)
- [lib/modules/accounting/inventory/stock-movements.ts:1-30](file://lib/modules/accounting/inventory/stock-movements.ts#L1-L30)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [lib/modules/accounting/services/document-confirm.service.ts:1-637](file://lib/modules/accounting/services/document-confirm.service.ts#L1-L637)
- [lib/modules/accounting/document-states.ts:1-155](file://lib/modules/accounting/document-states.ts#L1-L155)

### Counterparty Management
Counterparties represent customers and suppliers. The system tracks balances, interaction history, and supports filtering and search. Balances are recalculated via the Finance module.

```mermaid
sequenceDiagram
participant UI as "UI"
participant API as "Counterparties API"
participant DB as "Prisma"
participant BAL as "Finance Balance"
UI->>API : GET /api/accounting/counterparties
API->>DB : findMany(where, include balance)
DB-->>API : counterparties
API-->>UI : { data, total, page, limit }
UI->>API : GET /api/accounting/counterparties/[id]
API->>DB : findUnique(include balance, interactions)
DB-->>API : counterparty
API->>BAL : getBalance(id)
BAL-->>API : balanceRub
API-->>UI : counterparty + calculatedBalance
```

**Diagram sources**
- [app/api/accounting/counterparties/route.ts:1-81](file://app/api/accounting/counterparties/route.ts#L1-L81)
- [app/api/accounting/counterparties/[id]/route.ts:1-87](file://app/api/accounting/counterparties/[id]/route.ts#L1-L87)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)

**Section sources**
- [app/api/accounting/counterparties/route.ts:1-81](file://app/api/accounting/counterparties/route.ts#L1-L81)
- [app/api/accounting/counterparties/[id]/route.ts:1-87](file://app/api/accounting/counterparties/[id]/route.ts#L1-L87)
- [components/accounting/CounterpartiesTable.tsx:1-190](file://components/accounting/CounterpartiesTable.tsx#L1-L190)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)

### Reference Data Management
Reference data includes units of measurement, product categories, price lists, and warehouses. These are maintained via dedicated APIs and used across documents and stock.

```mermaid
graph LR
UNITS["Units API<br/>/api/accounting/units"] --> PRISMA["Unit model"]
CATS["Categories<br/>(via Product)"] --> PRISMA
PRICELISTS["Price Lists API<br/>/api/accounting/price-lists"] --> PRISMA
WAREHOUSES["Warehouses API<br/>/api/accounting/warehouses"] --> PRISMA
```

**Diagram sources**
- [app/api/accounting/units/route.ts:1-39](file://app/api/accounting/units/route.ts#L1-L39)
- [app/api/accounting/price-lists/route.ts:1-40](file://app/api/accounting/price-lists/route.ts#L1-L40)
- [app/api/accounting/warehouses/route.ts:1-45](file://app/api/accounting/warehouses/route.ts#L1-L45)
- [prisma/schema.prisma:81-106](file://prisma/schema.prisma#L81-L106)

**Section sources**
- [app/api/accounting/units/route.ts:1-39](file://app/api/accounting/units/route.ts#L1-L39)
- [app/api/accounting/price-lists/route.ts:1-40](file://app/api/accounting/price-lists/route.ts#L1-L40)
- [app/api/accounting/warehouses/route.ts:1-45](file://app/api/accounting/warehouses/route.ts#L1-L45)

### Document Creation Workflow
The CreateDocumentDialog drives document creation with dynamic visibility of warehouse, target warehouse, and counterparty based on document type.

```mermaid
sequenceDiagram
participant UI as "CreateDocumentDialog"
participant API as "Documents API"
participant DB as "Prisma"
UI->>UI : Select type, optional warehouse/target, counterparty
UI->>API : POST /api/accounting/documents
API->>DB : generateDocumentNumber(type)
API->>DB : create Document + DocumentItems
DB-->>API : created document
API-->>UI : { document, typeName, statusName }
```

**Diagram sources**
- [components/accounting/CreateDocumentDialog.tsx:1-244](file://components/accounting/CreateDocumentDialog.tsx#L1-L244)
- [app/api/accounting/documents/route.ts:63-135](file://app/api/accounting/documents/route.ts#L63-L135)
- [lib/modules/accounting/documents.ts:69-88](file://lib/modules/accounting/documents.ts#L69-L88)

**Section sources**
- [components/accounting/CreateDocumentDialog.tsx:1-244](file://components/accounting/CreateDocumentDialog.tsx#L1-L244)
- [lib/modules/accounting/documents.ts:1-144](file://lib/modules/accounting/documents.ts#L1-L144)

## Dependency Analysis
The module exhibits clear separation of concerns with domain-specific organization:
- UI depends on API routes and shared components.
- API routes depend on Prisma models and specialized domain services.
- Domain services encapsulate business logic and coordinate across inventory and finance domains.
- Centralized state machine provides consistent transition validation.
- Transaction-safe services ensure atomicity across multiple operations.

```mermaid
graph TB
UI["UI Components<br/>pages, dialogs"] --> API["API Routes"]
API --> CONFIRM["Document Confirmation Service"]
API --> INVENTORY["Inventory Services"]
API --> FINANCE["Finance Services"]
CONFIRM --> STATES["State Machine"]
CONFIRM --> INVENTORY
CONFIRM --> FINANCE
INVENTORY --> DB["Prisma Models"]
FINANCE --> DB
STATES --> DB
DB --> FIN["Finance Balance"]
```

**Diagram sources**
- [lib/modules/accounting/services/document-confirm.service.ts:16-46](file://lib/modules/accounting/services/document-confirm.service.ts#L16-L46)
- [lib/modules/accounting/document-states.ts:16-34](file://lib/modules/accounting/document-states.ts#L16-L34)
- [lib/modules/accounting/inventory/predicates.ts:12-26](file://lib/modules/accounting/inventory/predicates.ts#L12-L26)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)
- [prisma/schema.prisma:1-1064](file://prisma/schema.prisma#L1-L1064)

**Section sources**
- [lib/modules/accounting/services/document-confirm.service.ts:16-46](file://lib/modules/accounting/services/document-confirm.service.ts#L16-L46)
- [lib/modules/accounting/document-states.ts:16-34](file://lib/modules/accounting/document-states.ts#L16-L34)
- [lib/modules/accounting/inventory/predicates.ts:12-26](file://lib/modules/accounting/inventory/predicates.ts#L12-L26)
- [lib/modules/accounting/finance/cogs.ts:39-89](file://lib/modules/accounting/finance/cogs.ts#L39-L89)
- [lib/modules/accounting/balance.ts:1-7](file://lib/modules/accounting/balance.ts#L1-L7)
- [prisma/schema.prisma:1-1064](file://prisma/schema.prisma#L1-L1064)

## Performance Considerations
- **Transaction batching**: Document confirmation occurs within a single database transaction for atomicity and performance.
- **Idempotent operations**: Stock movements and reversals are designed to be safe across retries, reducing error handling overhead.
- **Domain-specific optimization**: Inventory and finance operations are optimized separately for their specific use cases.
- **Event-driven processing**: Outbox pattern ensures post-confirmation handlers don't block the main transaction.
- **Batch queries**: Dashboard loads multiple metrics concurrently to minimize latency.
- **Index optimization**: Strategic indexes on enums and frequently filtered fields improve query performance.
- **Aggregation optimization**: Enhanced stock report computes aggregates server-side to avoid client-side heavy computations.
- **Pagination**: APIs enforce limits and pagination to prevent large result sets.
- **Test parallelization**: Unit tests run in parallel for faster feedback, while service and integration tests execute sequentially to prevent database race conditions.

## Troubleshooting Guide
Common issues and resolutions:
- **Authentication/authorization errors**: Ensure proper permissions for document and reference data operations.
- **Validation errors**: Verify request bodies conform to Zod schemas; check required fields for document creation.
- **Draft-only edits**: Documents in non-draft status cannot be modified or deleted.
- **Missing balances**: Confirm Finance module balance recalculations are up to date.
- **Confirmation failures**: Check DocumentConfirmError details for specific validation failures (stock availability, inventory count requirements).
- **State transition errors**: Use validateTransition to check allowed transitions before attempting state changes.
- **Inventory adjustment issues**: Verify that inventory count documents have actual quantities filled and appropriate warehouse assignment.
- **Test execution failures**: Check Vitest configuration for proper environment setup and database connectivity.
- **Database cleanup issues**: Ensure test database is properly initialized and cleaned between test runs.
- **Race condition errors**: Verify that service and integration tests are configured for sequential execution.

**Section sources**
- [app/api/accounting/documents/[id]/route.ts:63-165](file://app/api/accounting/documents/[id]/route.ts#L63-L165)
- [app/api/accounting/counterparties/[id]/route.ts:35-86](file://app/api/accounting/counterparties/[id]/route.ts#L35-L86)
- [lib/modules/accounting/services/document-confirm.service.ts:99-160](file://lib/modules/accounting/services/document-confirm.service.ts#L99-L160)
- [lib/modules/accounting/document-states.ts:128-142](file://lib/modules/accounting/document-states.ts#L128-L142)
- [tests/helpers/test-db.ts:1-75](file://tests/helpers/test-db.ts#L1-L75)
- [vitest.integration.config.ts:1-36](file://vitest.integration.config.ts#L1-L36)

## Conclusion
The Accounting module provides a cohesive, extensible foundation for inventory, document processing, and counterparty management. Following the major restructuring, the module now features transaction-safe document confirmation, centralized state management, and domain-specific organization that enables scalable operations across multiple warehouses and document workflows. The new architecture ensures data integrity, improves maintainability, and provides a solid foundation for future enhancements.

**Updated** The enhanced testing infrastructure with multi-tier Vitest configurations ensures comprehensive coverage of unit, service, and integration testing scenarios, providing confidence in code quality and system reliability across all operational domains.

## Appendices

### Document Types and Business Rules
- **Stock operations**: stock_receipt, write_off, stock_transfer, inventory_count
- **Purchase operations**: purchase_order, incoming_shipment, supplier_return
- **Sales operations**: sales_order, outgoing_shipment, customer_return
- **Payment operations**: incoming_payment, outgoing_payment

**Updated** Sales orders now support extended lifecycle with shipped and delivered states, while inventory counts trigger automatic adjustment document creation.

Rules:
- **Stock impact**: Increase/decrease classification determines inventory movement.
- **Counterparty impact**: Receivables/payables affected by sales/purchases and payments.
- **Numbering**: Type-specific prefixes with auto-increment counters.
- **Visibility**: UI dynamically shows required fields based on document type.
- **State transitions**: Centralized validation ensures consistent business rules across all document types.

**Section sources**
- [lib/modules/accounting/documents.ts:1-144](file://lib/modules/accounting/documents.ts#L1-L144)
- [lib/modules/accounting/document-states.ts:45-104](file://lib/modules/accounting/document-states.ts#L45-L104)
- [components/accounting/CreateDocumentDialog.tsx:17-31](file://components/accounting/CreateDocumentDialog.tsx#L17-L31)

### Data Model Highlights
- **Document and DocumentItem**: Define transactional records with expected/actual quantities and differences.
- **StockRecord**: Maintains per-warehouse quantities and moving average cost for real-time tracking.
- **StockMovement**: Logs immutable inventory changes with movement types and reversal support.
- **Counterparty and CounterpartyBalance**: Track relationships and balances with finance integration.
- **Units, PriceList, and Warehouse**: Reference entities used across documents and stock operations.
- **Outbox Events**: Immutable event log for post-confirmation handlers and audit trails.

**Updated** Enhanced data model now includes outbox events for reliable post-confirmation processing and improved audit trail functionality.

**Section sources**
- [prisma/schema.prisma:449-538](file://prisma/schema.prisma#L449-L538)
- [prisma/schema.prisma:386-437](file://prisma/schema.prisma#L386-L437)
- [prisma/schema.prisma:309-363](file://prisma/schema.prisma#L309-L363)
- [prisma/schema.prisma:81-106](file://prisma/schema.prisma#L81-L106)
- [prisma/schema.prisma:544-590](file://prisma/schema.prisma#L544-L590)
- [prisma/schema.prisma:369-384](file://prisma/schema.prisma#L369-L384)

### Transaction Safety Guarantees
The document confirmation service provides strict transaction safety guarantees:
- **Atomic operations**: All confirmation steps occur within a single database transaction
- **Idempotent stock operations**: Stock movements and reversals are safe across retries
- **Consistent state**: Document status updates only occur after all stock effects succeed
- **Event reliability**: Outbox pattern ensures post-confirmation handlers are triggered reliably
- **Error rollback**: Any failure in the confirmation sequence rolls back all changes

**Section sources**
- [lib/modules/accounting/services/document-confirm.service.ts:244-350](file://lib/modules/accounting/services/document-confirm.service.ts#L244-L350)
- [lib/modules/accounting/services/document-confirm.service.ts:351-366](file://lib/modules/accounting/services/document-confirm.service.ts#L351-L366)

### Testing Strategy and Execution Patterns

The Accounting module employs a comprehensive testing strategy with distinct configurations for different test types:

#### Test Execution Commands
- **Full test suite**: `npm run test` - Runs all test configurations sequentially
- **Unit tests only**: `npm run test:unit` - Pure unit tests with parallel execution
- **Service tests**: `npm run test:service` - Database-backed service tests with sequential execution
- **Integration tests**: `npm run test:integration` - Full integration tests against real database
- **Watch mode**: `npm run test:watch` - Continuous test execution during development
- **Coverage**: `npm run test:cov` - Test coverage generation

#### Database Isolation and Cleanup
The testing infrastructure ensures proper database isolation through:
- **Sequential execution**: Prevents race conditions between test files
- **Database cleanup**: Comprehensive cleanup of test data in dependency order
- **Environment setup**: Proper environment variable loading for test databases
- **Connection management**: Graceful database connection handling and cleanup

**Section sources**
- [vitest.config.ts:1-30](file://vitest.config.ts#L1-L30)
- [vitest.unit.config.ts:1-34](file://vitest.unit.config.ts#L1-L34)
- [vitest.service.config.ts:1-40](file://vitest.service.config.ts#L1-L40)
- [vitest.integration.config.ts:1-36](file://vitest.integration.config.ts#L1-L36)
- [tests/helpers/test-db.ts:1-75](file://tests/helpers/test-db.ts#L1-L75)
- [tests/setup.ts:1-26](file://tests/setup.ts#L1-L26)
- [package.json:5-33](file://package.json#L5-L33)
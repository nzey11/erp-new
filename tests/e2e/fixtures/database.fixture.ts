import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5434/listopt_erp_test";

let pool: Pool | null = null;

/** Get a shared pg Pool for E2E test database operations */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

/** Clean all data from the test database */
export async function cleanDatabase(): Promise<void> {
  const p = getPool();
  await p.query(`
    TRUNCATE TABLE 
      "DocumentItem",
      "Document",
      "DocumentCounter",
      "StockRecord",
      "CounterpartyBalance",
      "CounterpartyInteraction",
      "PurchasePrice",
      "SalePrice",
      "PriceList",
      "ProductCustomField",
      "CustomFieldDefinition",
      "ProductVariant",
      "VariantOption",
      "VariantType",
      "ProductDiscount",
      "SkuCounter",
      "Product",
      "ProductCategory",
      "Counterparty",
      "Warehouse",
      "TenantSettings",
      "TenantMembership",
      "Tenant",
      "Unit",
      "User"
    CASCADE
  `);
}

/** Disconnect from the database pool */
export async function disconnectDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// =============================================
// Helper: Insert and return a row
// =============================================

async function insertRow<T extends Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const p = getPool();
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  const res = await p.query(
    `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values
  );
  return res.rows[0] as T;
}

async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const p = getPool();
  const res = await p.query(sql, params);
  return (res.rows[0] as T) ?? null;
}

function cuid(): string {
  // Simple cuid-like ID for test data
  return "e2e_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =============================================
// Factory functions (raw pg, no Prisma)
// =============================================

export type DbRow = Record<string, unknown> & { id: string };

export async function createUser(overrides: {
  username?: string;
  password?: string;
  role?: string;
  isActive?: boolean;
} = {}): Promise<DbRow> {
  const id = cuid();
  const user = await insertRow("User", {
    id,
    username: overrides.username ?? `user_${id}`,
    password: overrides.password ?? "$2a$10$placeholder_hash",
    role: overrides.role ?? "admin",
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create tenant and membership for the user (required for login)
  const tenantId = `tenant-${user.id}`;
  await insertRow("Tenant", {
    id: tenantId,
    name: `Tenant ${tenantId}`,
    slug: tenantId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await insertRow("TenantMembership", {
    id: cuid(),
    userId: user.id as string,
    tenantId: tenantId,
    role: overrides.role ?? "admin",
    isActive: true,
    createdAt: new Date(),
  });

  return user as DbRow;
}

export async function createUnit(overrides: {
  name?: string;
  shortName?: string;
} = {}): Promise<DbRow> {
  const id = cuid();
  return insertRow("Unit", {
    id,
    name: overrides.name ?? `Единица ${id}`,
    shortName: overrides.shortName ?? id.slice(-6),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createWarehouse(overrides: {
  name?: string;
  address?: string;
  tenantId?: string;
} = {}): Promise<DbRow> {
  const id = cuid();

  // Use provided tenantId or create a default tenant
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const t = await insertRow<DbRow & { id: string }>("Tenant", {
      id: `tenant-wh-${id}`,
      name: `Tenant wh-${id}`,
      slug: `tenant-wh-${id}`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tenantId = t.id as string;
  }

  return insertRow("Warehouse", {
    id,
    tenantId,
    name: overrides.name ?? `Склад ${id}`,
    address: overrides.address ?? `Адрес ${id}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createCategory(overrides: {
  name?: string;
  parentId?: string | null;
} = {}): Promise<DbRow> {
  const id = cuid();
  return insertRow("ProductCategory", {
    id,
    name: overrides.name ?? `Категория ${id}`,
    parentId: overrides.parentId ?? null,
    order: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createProduct(overrides: {
  name?: string;
  sku?: string;
  unitId?: string;
  categoryId?: string | null;
  publishedToStore?: boolean;
} = {}): Promise<DbRow> {
  const id = cuid();
  let unitId = overrides.unitId;
  if (!unitId) {
    const unit = await createUnit();
    unitId = unit.id;
  }
  return insertRow("Product", {
    id,
    name: overrides.name ?? `Товар ${id}`,
    sku: overrides.sku ?? `SKU-${id}`,
    unitId,
    categoryId: overrides.categoryId ?? null,
    publishedToStore: overrides.publishedToStore ?? false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createCounterparty(overrides: {
  name?: string;
  type?: string;
} = {}): Promise<DbRow> {
  const id = cuid();
  return insertRow("Counterparty", {
    id,
    name: overrides.name ?? `Контрагент ${id}`,
    type: overrides.type ?? "customer",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createDocument(overrides: {
  number?: string;
  type?: string;
  status?: string;
  warehouseId?: string;
  targetWarehouseId?: string | null;
  counterpartyId?: string | null;
  totalAmount?: number;
  date?: Date;
  confirmedAt?: Date | null;
} = {}): Promise<DbRow> {
  const id = cuid();
  return insertRow("Document", {
    id,
    number: overrides.number ?? `DOC-${id}`,
    type: overrides.type ?? "stock_receipt",
    status: overrides.status ?? "draft",
    warehouseId: overrides.warehouseId ?? null,
    targetWarehouseId: overrides.targetWarehouseId ?? null,
    counterpartyId: overrides.counterpartyId ?? null,
    totalAmount: overrides.totalAmount ?? 0,
    date: overrides.date ?? new Date(),
    confirmedAt: overrides.confirmedAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createDocumentItem(
  documentId: string,
  productId: string,
  overrides: { quantity?: number; price?: number; total?: number } = {}
): Promise<DbRow> {
  const id = cuid();
  const quantity = overrides.quantity ?? 1;
  const price = overrides.price ?? 100;
  const total = overrides.total ?? quantity * price;
  return insertRow("DocumentItem", {
    id,
    documentId,
    productId,
    quantity,
    price,
    total,
  });
}

export async function createPriceList(overrides: {
  name?: string;
  description?: string | null;
} = {}): Promise<DbRow> {
  const id = cuid();
  return insertRow("PriceList", {
    id,
    name: overrides.name ?? `Прайс-лист ${id}`,
    description: overrides.description ?? null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createSalePrice(
  productId: string,
  overrides: {
    price?: number;
    priceListId?: string | null;
    validFrom?: Date;
  } = {}
): Promise<DbRow> {
  const id = cuid();
  return insertRow("SalePrice", {
    id,
    productId,
    price: overrides.price ?? 1000,
    priceListId: overrides.priceListId ?? null,
    validFrom: overrides.validFrom ?? new Date(),
    validTo: null,
    isActive: true,
    createdAt: new Date(),
  });
}

export async function createStockRecord(
  warehouseId: string,
  productId: string,
  overrides: {
    quantity?: number;
    averageCost?: number;
    totalCostValue?: number;
  } = {}
): Promise<DbRow> {
  const id = cuid();
  return insertRow("StockRecord", {
    id,
    warehouseId,
    productId,
    quantity: overrides.quantity ?? 0,
    averageCost: overrides.averageCost ?? 0,
    totalCostValue: overrides.totalCostValue ?? 0,
    updatedAt: new Date(),
  });
}

// =============================================
// Query helpers for assertions
// =============================================

export async function findStockRecord(
  warehouseId: string,
  productId: string
): Promise<DbRow | null> {
  return queryOne(
    `SELECT * FROM "StockRecord" WHERE "warehouseId" = $1 AND "productId" = $2`,
    [warehouseId, productId]
  );
}

export async function findDocument(id: string): Promise<DbRow | null> {
  return queryOne(`SELECT * FROM "Document" WHERE "id" = $1`, [id]);
}

export async function findProductByName(name: string): Promise<DbRow | null> {
  return queryOne(`SELECT * FROM "Product" WHERE "name" = $1`, [name]);
}

export async function findCategoryByName(name: string): Promise<DbRow | null> {
  return queryOne(`SELECT * FROM "ProductCategory" WHERE "name" = $1`, [name]);
}

export async function findDocumentsByType(type: string): Promise<DbRow[]> {
  const p = getPool();
  const res = await p.query(`SELECT * FROM "Document" WHERE "type" = $1`, [type]);
  return res.rows as DbRow[];
}

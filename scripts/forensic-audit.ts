/**
 * Forensic Audit Script for Database Consistency
 * Checks tenantId columns, NULL values, and schema drift
 */

import { db } from "@/lib/shared/db";

async function runAudit() {
  console.log("=== FORENSIC DATABASE AUDIT ===\n");

  // 1. Check tenantId column definitions
  console.log("1. Checking tenantId column definitions...");
  const columnInfo = await db.$queryRaw`
    SELECT table_name, column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name IN ('Product', 'Document', 'Counterparty', 'Warehouse', 'Tenant', 'TenantMembership', 'TenantSettings', 'CompanySettings')
      AND column_name = 'tenantId'
    ORDER BY table_name
  `;
  console.log("Column definitions:", JSON.stringify(columnInfo, null, 2));

  // 2. Check NULL values in tenantId columns
  console.log("\n2. Checking NULL values in tenantId columns...");
  const nullCounts = await db.$queryRaw`
    SELECT 'Product' AS table_name, COUNT(*) AS null_count FROM "Product" WHERE "tenantId" IS NULL
    UNION ALL
    SELECT 'Document', COUNT(*) FROM "Document" WHERE "tenantId" IS NULL
    UNION ALL
    SELECT 'Counterparty', COUNT(*) FROM "Counterparty" WHERE "tenantId" IS NULL
    UNION ALL
    SELECT 'Warehouse', COUNT(*) FROM "Warehouse" WHERE "tenantId" IS NULL
  `;
  console.log("NULL counts:", JSON.stringify(nullCounts, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  // 3. Check table existence (legacy vs new)
  console.log("\n3. Checking table existence...");
  const tableExists = await db.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('CompanySettings', 'TenantSettings', 'Tenant', 'TenantMembership')
    ORDER BY table_name
  `;
  console.log("Existing tables:", JSON.stringify(tableExists, null, 2));

  // 4. Check FK constraints on tenantId
  console.log("\n4. Checking FK constraints...");
  const fkConstraints = await db.$queryRaw`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('Product', 'Document', 'Counterparty', 'Warehouse')
      AND kcu.column_name = 'tenantId'
  `;
  console.log("FK constraints:", JSON.stringify(fkConstraints, null, 2));

  // 5. Check unique constraints
  console.log("\n5. Checking unique constraints...");
  const uniqueConstraints = await db.$queryRaw`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_name IN ('Product', 'Document', 'Counterparty', 'Warehouse')
      AND kcu.column_name LIKE '%tenant%'
  `;
  console.log("Unique constraints:", JSON.stringify(uniqueConstraints, null, 2));

  // 6. Sample data check
  console.log("\n6. Sample data check...");
  const productSample = await db.product.findMany({
    select: { id: true, tenantId: true },
    take: 3
  });
  console.log("Product samples:", JSON.stringify(productSample, null, 2));

  const documentSample = await db.document.findMany({
    select: { id: true, tenantId: true },
    take: 3
  });
  console.log("Document samples:", JSON.stringify(documentSample, null, 2));

  // 7. Check applied migrations
  console.log("\n7. Checking applied migrations...");
  try {
    const appliedMigrations = await db.$queryRaw`
      SELECT migration_name, finished_at 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC
    `;
    console.log("Applied migrations:", JSON.stringify(appliedMigrations, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));
  } catch (e) {
    console.log("WARNING: _prisma_migrations table does not exist. Database was likely created via 'db push' not 'migrate deploy'.");
  }

  // 8. Check unique constraints (tenantId + sku)
  console.log("\n8. Checking Product unique constraints...");
  const productUnique = await db.$queryRaw`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'Product' 
      AND indexdef LIKE '%tenant%'
  `;
  console.log("Product tenant indexes:", JSON.stringify(productUnique, null, 2));

  console.log("\n=== AUDIT COMPLETE ===");
  await db.$disconnect();
}

runAudit().catch((e) => {
  console.error("Audit failed:", e);
  process.exit(1);
});

/**
 * Resolve failed migration 20260315160420_add_payment_tenant_id
 *
 * This script checks the current state of the database and either:
 * 1. Marks the migration as resolved if Payment.tenantId already exists
 * 2. Or applies the missing changes manually
 */

import { db } from "@/lib/shared/db";

async function resolveFailedMigration() {
  console.log("=== Resolving failed migration 20260315160420_add_payment_tenant_id ===\n");

  // Check if Payment.tenantId column exists
  const columnCheck = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'Payment' AND column_name = 'tenantId'
  `;

  const tenantIdExists = columnCheck.length > 0;

  if (tenantIdExists) {
    console.log("✅ Payment.tenantId column already exists");

    // Check if the foreign key exists
    const fkCheck = await db.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'Payment' AND constraint_name = 'Payment_tenantId_fkey'
    `;

    if (fkCheck.length === 0) {
      console.log("⚠️  Foreign key Payment_tenantId_fkey is missing, adding it...");
      await db.$executeRaw`
        ALTER TABLE "Payment" 
        ADD CONSTRAINT "Payment_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE
      `;
      console.log("✅ Foreign key added");
    } else {
      console.log("✅ Foreign key Payment_tenantId_fkey already exists");
    }

    // Check if the index exists
    const indexCheck = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Payment' AND indexname = 'Payment_tenantId_idx'
    `;

    if (indexCheck.length === 0) {
      console.log("⚠️  Index Payment_tenantId_idx is missing, adding it...");
      await db.$executeRaw`CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId")`;
      console.log("✅ Index added");
    } else {
      console.log("✅ Index Payment_tenantId_idx already exists");
    }

    // Mark migration as resolved
    console.log("\n👉 To mark this migration as resolved in production, run:");
    console.log("   npx prisma migrate resolve --applied 20260315160420_add_payment_tenant_id");
  } else {
    console.log("❌ Payment.tenantId column does not exist");
    console.log("   The migration needs to be re-run. Check the error logs.");
    process.exit(1);
  }

  console.log("\n=== Resolution check complete ===");
}

resolveFailedMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Resolution failed:", error);
    process.exit(1);
  });

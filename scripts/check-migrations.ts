import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const db = new PrismaClient({ adapter });
  try {
    const rows = await db.$queryRawUnsafe<Array<{ migration_count: number }>>('SELECT COUNT(*)::int AS migration_count FROM "_prisma_migrations"');
    console.log('Migration count:', rows[0].migration_count);

    const migrations = await db.$queryRawUnsafe<Array<{ migration_name: string }>>('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name');
    console.log('\nApplied migrations:');
    migrations.forEach(m => console.log('  -', m.migration_name));
  } finally {
    await db.$disconnect();
  }
}

main();

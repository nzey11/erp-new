import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Default units
  const units = [
    { name: "Штука", shortName: "шт" },
    { name: "Килограмм", shortName: "кг" },
    { name: "Грамм", shortName: "г" },
    { name: "Литр", shortName: "л" },
    { name: "Метр", shortName: "м" },
    { name: "Метр квадратный", shortName: "м²" },
    { name: "Упаковка", shortName: "уп" },
    { name: "Коробка", shortName: "кор" },
    { name: "Палета", shortName: "пал" },
  ];

  for (const unit of units) {
    await prisma.unit.upsert({
      where: { shortName: unit.shortName },
      update: {},
      create: unit,
    });
  }
  console.log(`  ✓ ${units.length} units`);

  // Default warehouse
  await prisma.warehouse.upsert({
    where: { id: "default-warehouse" },
    update: {},
    create: {
      id: "default-warehouse",
      name: "Основной склад",
      address: "",
      responsibleName: "",
    },
  });
  console.log("  ✓ Default warehouse");

  // Document counters for all 12 types
  const prefixes = ["ОП", "СП", "ПМ", "ИН", "ЗП", "ПР", "ВП", "ЗК", "ОТ", "ВК", "ВхП", "ИсП"];
  for (const prefix of prefixes) {
    await prisma.documentCounter.upsert({
      where: { prefix },
      update: {},
      create: { prefix, lastNumber: 0 },
    });
  }
  console.log(`  ✓ ${prefixes.length} document counters`);

  // Admin user (password: admin123)
  const passwordHash = await hash("admin123", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: passwordHash,
      role: "admin",
    },
  });
  console.log('  ✓ Admin user (login: admin / admin123)');

  // Finance categories (system defaults)
  const financeCategories = [
    { name: "Оплата от покупателя", type: "income", isSystem: true, order: 1 },
    { name: "Возврат от поставщика", type: "income", isSystem: true, order: 2 },
    { name: "Прочий доход", type: "income", isSystem: true, order: 3 },
    { name: "Оплата поставщику", type: "expense", isSystem: true, order: 1 },
    { name: "Возврат покупателю", type: "expense", isSystem: true, order: 2 },
    { name: "Аренда", type: "expense", isSystem: true, order: 3 },
    { name: "Зарплата", type: "expense", isSystem: true, order: 4 },
    { name: "Налоги", type: "expense", isSystem: true, order: 5 },
    { name: "Прочий расход", type: "expense", isSystem: true, order: 6 },
  ];

  for (const cat of financeCategories) {
    await prisma.financeCategory.upsert({
      where: { id: `sys-${cat.type}-${cat.order}` },
      update: {},
      create: { id: `sys-${cat.type}-${cat.order}`, ...cat },
    });
  }
  console.log(`  ✓ ${financeCategories.length} finance categories`);

  // Payment counter
  await prisma.paymentCounter.upsert({
    where: { prefix: "PAY" },
    update: {},
    create: { prefix: "PAY", lastNumber: 0 },
  });
  console.log("  ✓ Payment counter");

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

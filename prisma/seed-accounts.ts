/**
 * Seed file for Russian Chart of Accounts (План счетов)
 * Based on Приказ Минфина РФ от 31.10.2000 N 94н
 */

import { AccountType, AccountCategory } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/shared/db";

interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId?: string;
  analyticsType?: string;
  order: number;
}

const ACCOUNTS: AccountSeed[] = [
  // ==========================================
  // Section I: Outside Assets (Внеоборотные активы) - 01-09
  // ==========================================
  { code: "01", name: "Основные средства", type: AccountType.active, category: AccountCategory.asset, order: 100 },
  { code: "02", name: "Амортизация основных средств", type: AccountType.passive, category: AccountCategory.asset, order: 110 },
  { code: "04", name: "Нематериальные активы", type: AccountType.active, category: AccountCategory.asset, order: 120 },
  { code: "05", name: "Амортизация нематериальных активов", type: AccountType.passive, category: AccountCategory.asset, order: 130 },

  // ==========================================
  // Section II: Production Stocks (Производственные запасы) - 10-19
  // ==========================================
  { code: "10", name: "Материалы", type: AccountType.active, category: AccountCategory.asset, order: 200 },
  { code: "19", name: "НДС по приобретенным ценностям", type: AccountType.active, category: AccountCategory.asset, analyticsType: "counterparty", order: 290 },

  // ==========================================
  // Section IV: Finished Goods and Goods (Готовая продукция и товары) - 40-46
  // ==========================================
  { code: "41", name: "Товары", type: AccountType.active, category: AccountCategory.asset, order: 400 },
  { code: "41.1", name: "Товары на складах", type: AccountType.active, category: AccountCategory.asset, analyticsType: "warehouse", order: 401 },
  { code: "41.2", name: "Товары в розничной торговле", type: AccountType.active, category: AccountCategory.asset, analyticsType: "warehouse", order: 402 },
  { code: "41.3", name: "Тара под товаром и порожняя", type: AccountType.active, category: AccountCategory.asset, order: 403 },
  { code: "42", name: "Торговая наценка", type: AccountType.passive, category: AccountCategory.asset, order: 410 },
  { code: "44", name: "Расходы на продажу", type: AccountType.active, category: AccountCategory.expense, order: 420 },
  { code: "45", name: "Товары отгруженные", type: AccountType.active, category: AccountCategory.asset, order: 430 },

  // ==========================================
  // Section V: Cash (Денежные средства) - 50-59
  // ==========================================
  { code: "50", name: "Касса", type: AccountType.active, category: AccountCategory.asset, order: 500 },
  { code: "50.1", name: "Касса организации", type: AccountType.active, category: AccountCategory.asset, order: 501 },
  { code: "51", name: "Расчетные счета", type: AccountType.active, category: AccountCategory.asset, order: 510 },
  { code: "52", name: "Валютные счета", type: AccountType.active, category: AccountCategory.asset, order: 520 },
  { code: "57", name: "Переводы в пути", type: AccountType.active, category: AccountCategory.asset, order: 570 },

  // ==========================================
  // Section VI: Settlements (Расчеты) - 60-79
  // ==========================================
  { code: "60", name: "Расчеты с поставщиками и подрядчиками", type: AccountType.active_passive, category: AccountCategory.liability, analyticsType: "counterparty", order: 600 },
  { code: "62", name: "Расчеты с покупателями и заказчиками", type: AccountType.active_passive, category: AccountCategory.asset, analyticsType: "counterparty", order: 620 },
  { code: "66", name: "Расчеты по краткосрочным кредитам и займам", type: AccountType.active_passive, category: AccountCategory.liability, order: 660 },
  { code: "67", name: "Расчеты по долгосрочным кредитам и займам", type: AccountType.active_passive, category: AccountCategory.liability, order: 670 },
  { code: "68", name: "Расчеты по налогам и сборам", type: AccountType.active_passive, category: AccountCategory.liability, order: 680 },
  { code: "68.01", name: "НДФЛ", type: AccountType.active_passive, category: AccountCategory.liability, order: 681 },
  { code: "68.02", name: "НДС", type: AccountType.active_passive, category: AccountCategory.liability, order: 682 },
  { code: "68.04", name: "Налог на прибыль", type: AccountType.active_passive, category: AccountCategory.liability, order: 684 },
  { code: "69", name: "Расчеты по социальному страхованию и обеспечению", type: AccountType.active_passive, category: AccountCategory.liability, order: 690 },
  { code: "70", name: "Расчеты с персоналом по оплате труда", type: AccountType.active_passive, category: AccountCategory.liability, order: 700 },
  { code: "71", name: "Расчеты с подотчетными лицами", type: AccountType.active_passive, category: AccountCategory.liability, order: 710 },
  { code: "73", name: "Расчеты с персоналом по прочим операциям", type: AccountType.active_passive, category: AccountCategory.liability, order: 730 },
  { code: "76", name: "Расчеты с разными дебиторами и кредиторами", type: AccountType.active_passive, category: AccountCategory.liability, order: 760 },

  // ==========================================
  // Section VII: Capital (Капитал) - 80-89
  // ==========================================
  { code: "80", name: "Уставный капитал", type: AccountType.passive, category: AccountCategory.equity, order: 800 },
  { code: "82", name: "Резервный капитал", type: AccountType.passive, category: AccountCategory.equity, order: 820 },
  { code: "83", name: "Добавочный капитал", type: AccountType.passive, category: AccountCategory.equity, order: 830 },
  { code: "84", name: "Нераспределенная прибыль (непокрытый убыток)", type: AccountType.active_passive, category: AccountCategory.equity, order: 840 },
  { code: "84.1", name: "Нераспределенная прибыль отчетного года", type: AccountType.passive, category: AccountCategory.equity, order: 841 },
  { code: "84.2", name: "Непокрытый убыток отчетного года", type: AccountType.active, category: AccountCategory.equity, order: 842 },

  // ==========================================
  // Section VIII: Financial Results (Финансовые результаты) - 90-99
  // ==========================================
  { code: "90", name: "Продажи", type: AccountType.active_passive, category: AccountCategory.income, order: 900 },
  { code: "90.1", name: "Выручка", type: AccountType.passive, category: AccountCategory.income, order: 901 },
  { code: "90.2", name: "Себестоимость продаж", type: AccountType.active, category: AccountCategory.expense, order: 902 },
  { code: "90.3", name: "НДС", type: AccountType.active, category: AccountCategory.expense, order: 903 },
  { code: "90.9", name: "Прибыль/убыток от продаж", type: AccountType.active_passive, category: AccountCategory.income, order: 909 },
  
  { code: "91", name: "Прочие доходы и расходы", type: AccountType.active_passive, category: AccountCategory.income, order: 910 },
  { code: "91.1", name: "Прочие доходы", type: AccountType.passive, category: AccountCategory.income, order: 911 },
  { code: "91.2", name: "Прочие расходы", type: AccountType.active, category: AccountCategory.expense, order: 912 },
  { code: "91.9", name: "Сальдо прочих доходов и расходов", type: AccountType.active_passive, category: AccountCategory.income, order: 919 },

  { code: "94", name: "Недостачи и потери от порчи ценностей", type: AccountType.active, category: AccountCategory.expense, order: 940 },
  { code: "96", name: "Резервы предстоящих расходов", type: AccountType.passive, category: AccountCategory.liability, order: 960 },
  { code: "97", name: "Расходы будущих периодов", type: AccountType.active, category: AccountCategory.asset, order: 970 },
  { code: "99", name: "Прибыли и убытки", type: AccountType.active_passive, category: AccountCategory.equity, order: 990 },
];

async function seedAccounts() {
  console.log("Seeding chart of accounts...");

  // Create JournalCounter if not exists
  await db.journalCounter.upsert({
    where: { prefix: "JE" },
    create: { prefix: "JE", lastNumber: 0 },
    update: {},
  });

  // Create accounts
  for (const account of ACCOUNTS) {
    // Find parent ID if parentId is specified
    let parentId: string | undefined = undefined;
    if (account.code.includes(".")) {
      const parentCode = account.code.split(".")[0];
      const parent = await db.account.findUnique({
        where: { code: parentCode },
      });
      if (parent) {
        parentId = parent.id;
      }
    }

    await db.account.upsert({
      where: { code: account.code },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        parentId: parentId,
        analyticsType: account.analyticsType,
        order: account.order,
        isSystem: true,
        isActive: true,
      },
      update: {
        name: account.name,
        type: account.type,
        category: account.category,
        parentId: parentId,
        analyticsType: account.analyticsType,
        order: account.order,
      },
    });

    console.log(`Created/updated account: ${account.code} - ${account.name}`);
  }

  console.log("Chart of accounts seeded successfully!");
}

async function createDefaultCompanySettings() {
  console.log("Creating default company settings...");

  // Check if settings already exist
  const existing = await db.companySettings.findFirst();
  if (existing) {
    console.log("Company settings already exist, skipping...");
    return existing;
  }

  // Get default account IDs for mappings
  const cashAccount = await db.account.findUnique({ where: { code: "50" } });
  const bankAccount = await db.account.findUnique({ where: { code: "51" } });
  const inventoryAccount = await db.account.findUnique({ where: { code: "41.1" } });
  const supplierAccount = await db.account.findUnique({ where: { code: "60" } });
  const customerAccount = await db.account.findUnique({ where: { code: "62" } });
  const vatAccount = await db.account.findUnique({ where: { code: "19" } });
  const vatPayableAccount = await db.account.findUnique({ where: { code: "68.02" } });
  const salesAccount = await db.account.findUnique({ where: { code: "90.1" } });
  const cogsAccount = await db.account.findUnique({ where: { code: "90.2" } });
  const profitAccount = await db.account.findUnique({ where: { code: "99" } });
  const retainedEarningsAccount = await db.account.findUnique({ where: { code: "84" } });

  const settings = await db.companySettings.create({
    data: {
      name: "Моя организация",
      taxRegime: "usn_income",
      vatRate: 20,
      usnRate: 6,
      initialCapital: 0,
      fiscalYearStartMonth: 1,
      cashAccountId: cashAccount?.id,
      bankAccountId: bankAccount?.id,
      inventoryAccountId: inventoryAccount?.id,
      supplierAccountId: supplierAccount?.id,
      customerAccountId: customerAccount?.id,
      vatAccountId: vatAccount?.id,
      vatPayableAccountId: vatPayableAccount?.id,
      salesAccountId: salesAccount?.id,
      cogsAccountId: cogsAccount?.id,
      profitAccountId: profitAccount?.id,
      retainedEarningsAccountId: retainedEarningsAccount?.id,
    },
  });

  console.log("Default company settings created!");
  return settings;
}

async function main() {
  await seedAccounts();
  await createDefaultCompanySettings();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

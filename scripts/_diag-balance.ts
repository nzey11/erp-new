import { db } from "../lib/shared/db";

async function run() {
  const ac = await db.$queryRawUnsafe<{ cnt: string }[]>('SELECT COUNT(*) as cnt FROM "Account"');
  const je = await db.$queryRawUnsafe<{ cnt: string }[]>('SELECT COUNT(*) as cnt FROM "JournalEntry"');
  const ll = await db.$queryRawUnsafe<{ cnt: string }[]>('SELECT COUNT(*) as cnt FROM "LedgerLine"');
  const llsum = await db.$queryRawUnsafe<{ sd: string; sc: string }[]>(
    'SELECT COALESCE(SUM(CAST(debit AS FLOAT)),0) as sd, COALESCE(SUM(CAST(credit AS FLOAT)),0) as sc FROM "LedgerLine"'
  );

  console.log("Account count:      ", ac[0].cnt);
  console.log("JournalEntry count: ", je[0].cnt);
  console.log("LedgerLine count:   ", ll[0].cnt);
  console.log("LedgerLine SUM(debit):", llsum[0].sd);
  console.log("LedgerLine SUM(credit):", llsum[0].sc);

  await db.$disconnect();
}

run().catch(console.error);

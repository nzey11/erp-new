/**
 * Balance Sheet report (Бухгалтерский баланс, Форма 1)
 * РСБУ — calculated from ledger account balances
 *
 * Assets = Liabilities + Equity (балансовое равенство)
 *
 * Equity is NOT a balancing figure — it comes from accounts 80, 82, 83, 84, 99
 */

import { getAccountBalance, sumAccountBalances } from "@/lib/modules/accounting/balances";

export async function generateBalanceSheet(asOfDate: Date) {
  // ──────────────────────────────────────────────────────
  // ACTIVE (АКТИВ)
  // ──────────────────────────────────────────────────────

  // I. Non-current assets (Внеоборотные активы)
  const fixedAssets = Math.max(0,
    (await getAccountBalance("01", asOfDate)).balance -
    Math.abs((await getAccountBalance("02", asOfDate)).balance)
  );
  const intangibleAssets = Math.max(0,
    (await getAccountBalance("04", asOfDate)).balance -
    Math.abs((await getAccountBalance("05", asOfDate)).balance)
  );
  const totalNonCurrentAssets = fixedAssets + intangibleAssets;

  // II. Current assets (Оборотные активы)
  // 1210 — Запасы (счёт 41 + субсчета 41.1, 41.2, 41.3)
  // Posting rules write to sub-accounts (41.1 etc.) — must sum all of them
  const inventory = Math.max(
    0,
    await sumAccountBalances(["41", "41.1", "41.2", "41.3"], asOfDate)
  );

  // 1230 — Дебиторская задолженность (счет 62, только положительное сальдо)
  const { debit: debit62, credit: credit62 } = await getAccountBalance("62", asOfDate);
  const receivables = Math.max(0, debit62 - credit62);

  // 1260 — НДС по приобретенным ценностям (счет 19)
  const vatReceivable = Math.max(0, (await getAccountBalance("19", asOfDate)).balance);

  // 1250 — Денежные средства (50 + 51 + 52)
  const cash = await sumAccountBalances(["50", "51", "52"], asOfDate);

  // 1170 — Прочие финансовые вложения (57)
  const otherCurrentAssets = Math.max(0, (await getAccountBalance("57", asOfDate)).balance);

  const totalCurrentAssets =
    inventory + receivables + vatReceivable + cash + otherCurrentAssets;

  const totalAssets = totalNonCurrentAssets + totalCurrentAssets;

  // ──────────────────────────────────────────────────────
  // PASSIVE (ПАССИВ)
  // ──────────────────────────────────────────────────────

  // III. Capital and Reserves (Капитал и резервы)
  // 1310 — Уставный капитал (80)
  const shareCapital = Math.abs((await getAccountBalance("80", asOfDate)).balance);
  // 1350 — Добавочный капитал (83)
  const additionalCapital = Math.abs((await getAccountBalance("83", asOfDate)).balance);
  // 1360 — Резервный капитал (82)
  const reserveCapital = Math.abs((await getAccountBalance("82", asOfDate)).balance);
  // 1370 — Нераспределенная прибыль = сальдо 84 + сальдо 99 (могут быть и дебетовые — убыток)
  // + незакрытый результат текущего периода по счёту 90.x
  // (до реформации баланса счёт 99 пуст — прибыль «живёт» в 90)
  const { balance: bal84 } = await getAccountBalance("84", asOfDate);
  const { balance: bal99 } = await getAccountBalance("99", asOfDate);

  // Текущий финансовый результат из счётов 90 (до закрытия)
  // Прибыль = выручка (Кт90.1) − себестоимость (Дт90.2) − НДС начисленный (Дт90.3)
  const { balance: bal90_1 } = await getAccountBalance("90.1", asOfDate);
  const { balance: bal90_2 } = await getAccountBalance("90.2", asOfDate);
  const { balance: bal90_3 } = await getAccountBalance("90.3", asOfDate);
  // 90.1 — пассивный субсчёт (Кт = выручка), balance < 0 при наличии выручки
  // 90.2 и 90.3 — активные субсчёты (Дт = расход), balance > 0
  const interimPnl = -bal90_1 - bal90_2 - bal90_3;

  const retainedEarnings = -(bal84) - (bal99) + interimPnl; // passive accounts: credit = profit
  const totalEquity = shareCapital + additionalCapital + reserveCapital + retainedEarnings;

  // IV. Long-term liabilities (Долгосрочные обязательства)
  const longTermDebt = Math.max(0, -(await getAccountBalance("67", asOfDate)).balance);
  const totalNonCurrentLiabilities = longTermDebt;

  // V. Short-term liabilities (Краткосрочные обязательства)
  // 1520 — Кредиторская задолженность поставщикам (счет 60, кредитовое сальдо)
  const { debit: debit60, credit: credit60 } = await getAccountBalance("60", asOfDate);
  const payables = Math.max(0, credit60 - debit60);

  // 1520 — Задолженность покупателям (счет 62, кредитовое сальдо — авансы)
  const customerAdvances = Math.max(0, credit62 - debit62);

  // 1510 — Краткосрочные займы
  const shortTermDebt = Math.max(0, -(await getAccountBalance("66", asOfDate)).balance);

  // 68 — Налоги к уплате
  const taxPayable = Math.max(0, -(await getAccountBalance("68", asOfDate)).balance);

  const totalCurrentLiabilities =
    payables + customerAdvances + shortTermDebt + taxPayable;

  const totalLiabilities = totalNonCurrentLiabilities + totalCurrentLiabilities;

  const totalPassive = totalEquity + totalLiabilities;

  // Balance check
  const balanced = Math.abs(totalAssets - totalPassive) < 0.01;

  return {
    asOfDate,
    assets: {
      nonCurrent: {
        fixedAssets,
        intangibleAssets,
        total: totalNonCurrentAssets,
      },
      current: {
        inventory,
        receivables,
        vatReceivable,
        cash,
        otherCurrentAssets,
        total: totalCurrentAssets,
      },
      total: totalAssets,
    },
    liabilities: {
      nonCurrent: {
        longTermDebt,
        total: totalNonCurrentLiabilities,
      },
      current: {
        payables,
        customerAdvances,
        shortTermDebt,
        taxPayable,
        total: totalCurrentLiabilities,
      },
      total: totalLiabilities,
    },
    equity: {
      shareCapital,
      additionalCapital,
      reserveCapital,
      retainedEarnings,
      total: totalEquity,
    },
    totalPassive,
    balanced,
  };
}

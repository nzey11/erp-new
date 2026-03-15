/**
 * Finance domain — Posting Rules.
 * Auto-journal-entry templates for each document type.
 *
 * Russian Chart of Accounts (Приказ Минфина N 94н) mappings:
 *
 * incoming_shipment (Приёмка от поставщика):
 *   Дт 41.1 Кт 60 — товар принят на склад
 *   Дт 19   Кт 60 — входящий НДС (только ОСНО)
 *
 * outgoing_shipment (Отгрузка покупателю):
 *   Дт 62   Кт 90.1 — начислена выручка
 *   Дт 90.2 Кт 41.1 — списана себестоимость
 *   Дт 90.3 Кт 68.02 — начислен НДС (только ОСНО)
 *
 * incoming_payment (Оплата от покупателя):
 *   Дт 51   Кт 62
 *
 * outgoing_payment (Оплата поставщику):
 *   Дт 60   Кт 51
 *
 * customer_return (Возврат от покупателя):
 *   Дт 41.1 Кт 62 — товар вернулся на склад
 *   Дт 90.1 Кт 62 — сторно выручки (сторно)
 *
 * supplier_return (Возврат поставщику):
 *   Дт 60   Кт 41.1
 *
 * Phase 1.4: moved from lib/modules/accounting/posting-rules.ts
 * Import path changed to @/lib/modules/accounting/finance/posting-rules
 */

import { db } from "@/lib/shared/db";
import { calculateCogsForShipment } from "./cogs";

interface PostingLine {
  debitCode: string;
  creditCode: string;
  amount: number;
  counterpartyId?: string;
  warehouseId?: string;
  productId?: string;
  description?: string;
}

/** Resolve account ID by code, throw if not found */
async function resolveAccount(code: string): Promise<string> {
  const acc = await db.account.findUnique({ where: { code } });
  if (!acc) throw new Error(`Account ${code} not found in chart of accounts`);
  return acc.id;
}

/** Get tenant settings for posting rules (by tenantId) */
async function getSettings(tenantId: string) {
  return db.tenantSettings.findUnique({ where: { tenantId } });
}

/**
 * Build posting lines for a confirmed document.
 * Returns null if document type has no posting rules.
 */
export async function buildPostingLines(
  documentId: string
): Promise<PostingLine[] | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: { items: true },
  });

  if (!doc) throw new Error(`Document ${documentId} not found`);

  const settings = await getSettings(doc.tenantId);
  const isOsno = settings?.taxRegime === "osno";
  const vatRate = settings?.vatRate ?? 20;

  const lines: PostingLine[] = [];

  switch (doc.type) {
    // ─────────────────────────────────────────
    // PURCHASE: incoming_shipment
    // Дт 41.1 Кт 60 (без НДС)
    // Дт 19   Кт 60 (входящий НДС, только ОСНО)
    // ─────────────────────────────────────────
    case "incoming_shipment": {
      const amountWithoutVat = isOsno
        ? doc.totalAmount / (1 + vatRate / 100)
        : doc.totalAmount;

      lines.push({
        debitCode: "41.1",
        creditCode: "60",
        amount: amountWithoutVat,
        counterpartyId: doc.counterpartyId ?? undefined,
        warehouseId: doc.warehouseId ?? undefined,
      });

      if (isOsno) {
        const vatAmount = doc.totalAmount - amountWithoutVat;
        lines.push({
          debitCode: "19",
          creditCode: "60",
          amount: vatAmount,
          counterpartyId: doc.counterpartyId ?? undefined,
          description: "НДС входящий",
        });
      }
      break;
    }

    // ─────────────────────────────────────────
    // SALE: outgoing_shipment
    // Дт 62   Кт 90.1 (выручка)
    // Дт 90.2 Кт 41.1 (себестоимость по ср. цене)
    // Дт 90.3 Кт 68.02 (НДС, только ОСНО)
    // ─────────────────────────────────────────
    case "outgoing_shipment": {
      const revenueWithVat = doc.totalAmount;
      const revenueWithoutVat = isOsno
        ? revenueWithVat / (1 + vatRate / 100)
        : revenueWithVat;

      // Revenue: Дт 62 Кт 90.1
      lines.push({
        debitCode: "62",
        creditCode: "90.1",
        amount: revenueWithVat,
        counterpartyId: doc.counterpartyId ?? undefined,
      });

      // COGS: Дт 90.2 Кт 41.1 (using average cost)
      const { totalCogs, lines: cogsLines } = await calculateCogsForShipment(documentId);
      if (totalCogs > 0) {
        lines.push({
          debitCode: "90.2",
          creditCode: "41.1",
          amount: totalCogs,
          warehouseId: doc.warehouseId ?? undefined,
          description: "Себестоимость реализованных товаров",
        });
      } else if (doc.items.length > 0) {
        // Fallback: use item prices as COGS if no average cost available
        lines.push({
          debitCode: "90.2",
          creditCode: "41.1",
          amount: 0,
          warehouseId: doc.warehouseId ?? undefined,
          description: "Себестоимость (средняя стоимость = 0)",
        });
      }

      // VAT: Дт 90.3 Кт 68.02 (only OSNO)
      if (isOsno) {
        const vatAmount = revenueWithVat - revenueWithoutVat;
        lines.push({
          debitCode: "90.3",
          creditCode: "68.02",
          amount: vatAmount,
          description: "НДС с реализации",
        });
      }

      // Store COGS detail for auditing (not needed for posting, for info only)
      void cogsLines;
      break;
    }

    // ─────────────────────────────────────────
    // PAYMENT FROM CUSTOMER: incoming_payment
    // Дт 51 Кт 62
    // ─────────────────────────────────────────
    case "incoming_payment": {
      lines.push({
        debitCode: "51",
        creditCode: "62",
        amount: doc.totalAmount,
        counterpartyId: doc.counterpartyId ?? undefined,
      });
      break;
    }

    // ─────────────────────────────────────────
    // PAYMENT TO SUPPLIER: outgoing_payment
    // Дт 60 Кт 51
    // ─────────────────────────────────────────
    case "outgoing_payment": {
      lines.push({
        debitCode: "60",
        creditCode: "51",
        amount: doc.totalAmount,
        counterpartyId: doc.counterpartyId ?? undefined,
      });
      break;
    }

    // ─────────────────────────────────────────
    // CUSTOMER RETURN: customer_return
    // Дт 41.1 Кт 62 (возврат товара)
    // ─────────────────────────────────────────
    case "customer_return": {
      lines.push({
        debitCode: "41.1",
        creditCode: "62",
        amount: doc.totalAmount,
        counterpartyId: doc.counterpartyId ?? undefined,
        warehouseId: doc.warehouseId ?? undefined,
      });
      break;
    }

    // ─────────────────────────────────────────
    // SUPPLIER RETURN: supplier_return
    // Дт 60 Кт 41.1
    // ─────────────────────────────────────────
    case "supplier_return": {
      lines.push({
        debitCode: "60",
        creditCode: "41.1",
        amount: doc.totalAmount,
        counterpartyId: doc.counterpartyId ?? undefined,
        warehouseId: doc.warehouseId ?? undefined,
      });
      break;
    }

    // ─────────────────────────────────────────
    // STOCK RECEIPT (оприходование): stock_receipt
    // Дт 41.1 Кт 91.1 (прочий доход — оприходование излишков)
    // ─────────────────────────────────────────
    case "stock_receipt": {
      lines.push({
        debitCode: "41.1",
        creditCode: "91.1",
        amount: doc.totalAmount,
        warehouseId: doc.warehouseId ?? undefined,
        description: "Оприходование товаров",
      });
      break;
    }

    // ─────────────────────────────────────────
    // WRITE OFF (списание): write_off
    // Дт 94 Кт 41.1
    // ─────────────────────────────────────────
    case "write_off": {
      lines.push({
        debitCode: "94",
        creditCode: "41.1",
        amount: doc.totalAmount,
        warehouseId: doc.warehouseId ?? undefined,
        description: "Списание товаров",
      });
      break;
    }

    // purchase_order, sales_order, stock_transfer, inventory_count
    // — no financial posting at draft/confirm stage
    default:
      return null;
  }

  // Filter out zero-amount lines
  return lines.filter((l) => l.amount > 0);
}

/** Resolve all account codes to IDs for posting */
export async function resolvePostingAccounts(
  lines: PostingLine[]
): Promise<
  {
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    counterpartyId?: string;
    warehouseId?: string;
    productId?: string;
    description?: string;
  }[]
> {
  const resolved = [];
  for (const line of lines) {
    const debitAccountId = await resolveAccount(line.debitCode);
    const creditAccountId = await resolveAccount(line.creditCode);
    resolved.push({
      debitAccountId,
      creditAccountId,
      amount: line.amount,
      counterpartyId: line.counterpartyId,
      warehouseId: line.warehouseId,
      productId: line.productId,
      description: line.description,
    });
  }
  return resolved;
}

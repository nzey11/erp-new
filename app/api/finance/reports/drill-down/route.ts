import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { FinanceReportService } from "@/lib/modules/accounting";
import { db, toNumber } from "@/lib/shared/db";
import type { DocumentType } from "@/lib/generated/prisma/client";

// Map categories to document types
const CATEGORY_DOCUMENT_TYPES: Record<string, DocumentType[]> = {
  // P&L
  grossRevenue: ["outgoing_shipment"],
  customerReturns: ["customer_return"],
  // COGS (90.2) is recognised when we ship OUT — cost leaves inventory to 90.2
  cogs: ["outgoing_shipment"],
  supplierReturns: ["supplier_return"],
  // Selling expenses — outgoing shipments carry selling costs
  sellingExpenses: ["outgoing_shipment"],
  // Cash Flow — aggregated
  "operating.in": ["incoming_payment"],
  "operating.out": ["outgoing_payment"],
  // Cash Flow — broken down by payment method (account)
  "operating.in.bank": ["incoming_payment"],
  "operating.in.cash": ["incoming_payment"],
  "operating.in.forex": ["incoming_payment"],
  "operating.out.bank": ["outgoing_payment"],
  "operating.out.cash": ["outgoing_payment"],
  "operating.out.forex": ["outgoing_payment"],
  // Balance Sheet - stock movements
  "assets.stock.incoming": ["incoming_shipment", "stock_receipt", "customer_return"],
  "assets.stock.outgoing": ["outgoing_shipment", "write_off", "supplier_return"],
};

// Map payment method categories to paymentMethod filter values
const CATEGORY_PAYMENT_METHODS: Record<string, string> = {
  "operating.in.bank": "bank_transfer",
  "operating.in.cash": "cash",
  "operating.in.forex": "card",
  "operating.out.bank": "bank_transfer",
  "operating.out.cash": "cash",
  "operating.out.forex": "card",
};

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("reports:read");

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const asOfDate = searchParams.get("asOfDate");

    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // Handle balance sheet categories
    if (category === "assets.receivables") {
      return await getReceivablesDrillDown();
    }
    if (category === "liabilities.payables") {
      return NextResponse.json({ documents: [], payments: [], message: "Кредиторская задолженность рассчитывается на основе сальдо контрагентов" });
    }

    // COGS special path: fetch LedgerLine debit on 90.2 (actual cost, not sale price)
    if (category === "cogs") {
      return await getCogsDrillDown(session.tenantId, dateFrom, dateTo);
    }

    const docTypes = CATEGORY_DOCUMENT_TYPES[category];
    if (!docTypes) {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }

    // Build date filter
    const dateFilter: { confirmedAt?: { gte?: Date; lte?: Date } } = {};
    
    if (asOfDate) {
      // Balance sheet - up to date
      dateFilter.confirmedAt = { lte: new Date(asOfDate) };
    } else if (dateFrom && dateTo) {
      // P&L and Cash Flow - date range
      dateFilter.confirmedAt = { 
        gte: new Date(dateFrom), 
        lte: new Date(dateTo) 
      };
    }

    // Fetch documents
    const documents = await FinanceReportService.getDrillDownDocuments({
      docTypes: docTypes as string[],
      tenantId: session.tenantId,
      dateFilter,
    });

    const truncated = documents.length === 500;

    // Also fetch payments from Payment table for cash flow
    const payments = [];
    const isCashFlowCategory =
      category === "operating.in" ||
      category === "operating.out" ||
      category.startsWith("operating.in.") ||
      category.startsWith("operating.out.");

    if (isCashFlowCategory) {
      const paymentType = category.startsWith("operating.in") ? "income" : "expense";
      const paymentDateFilter: { date?: { gte?: Date; lte?: Date } } = {};
      
      if (dateFrom && dateTo) {
        paymentDateFilter.date = { 
          gte: new Date(dateFrom), 
          lte: new Date(dateTo) 
        };
      }

      // For sub-categories, additionally filter by paymentMethod
      const paymentMethod = CATEGORY_PAYMENT_METHODS[category];

      const paymentResults = await FinanceReportService.getDrillDownPayments({
        paymentType,
        tenantId: session.tenantId,
        dateFilter: paymentDateFilter,
        paymentMethod,
      });
      payments.push(...paymentResults);
    }

    const paymentsTruncated = payments.length === 500;

    // Format response — for COGS handled separately above
    // For other categories use document totalAmount
    const formattedDocs = documents.map((doc) => ({
      id: doc.id,
      number: doc.number,
      type: doc.type,
      date: doc.confirmedAt?.toISOString() || doc.date.toISOString(),
      amount: doc.totalAmount,
      counterparty: doc.counterparty?.name || null,
      warehouse: doc.warehouse?.name || null,
      status: doc.status,
    }));

    const formattedPayments = payments.map((p) => ({
      id: p.id,
      number: p.number,
      type: p.type,
      date: p.date.toISOString(),
      amount: p.amount,
      counterparty: p.counterparty?.name || null,
      category: p.category.name,
      linkedDocument: p.document ? { id: p.document.id, number: p.document.number } : null,
      isPayment: true,
    }));

    return NextResponse.json({ 
      documents: formattedDocs, 
      payments: formattedPayments,
      category,
      truncated: truncated || paymentsTruncated,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * COGS drill-down: fetch LedgerLine rows on account 90.2 (Дт 90.2 Кт 41.1)
 * Returns actual cost amounts, not document sale prices.
 * JournalEntry links to Document via sourceType/sourceId (polymorphic).
 */
async function getCogsDrillDown(
  tenantId: string,
  dateFrom: string | null,
  dateTo: string | null
) {
  // Try to find COGS account: first by standard code "90.2",
  // then fall back to CompanySettings.cogsAccountId
  let cogsAccount = await db.account.findUnique({ where: { code: "90.2" } });

  if (!cogsAccount) {
    // Fallback: use cogsAccountId from company settings
    const settings = await db.companySettings.findFirst({
      select: { cogsAccountId: true },
    });
    if (settings?.cogsAccountId) {
      cogsAccount = await db.account.findUnique({
        where: { id: settings.cogsAccountId },
      });
    }
  }

  if (!cogsAccount) {
    return NextResponse.json({
      documents: [],
      payments: [],
      category: "cogs",
      message: "Счёт 90.2 (Себестоимость продаж) не найден. Проверьте наличие счёта 90.2 в Плане счетов.",
    });
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  // Set lte to END of day (23:59:59.999) to include entries on the end date
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    dateFilter.lte = endOfDay;
  }

  // Fetch LedgerLines on 90.2, include JournalEntry (has sourceType/sourceId)
  // Note: sourceType is set to doc.type (e.g. "outgoing_shipment") by autoPostDocument,
  // NOT to "document" — so we filter by the document type that generates COGS.
  const lines = await db.ledgerLine.findMany({
    where: {
      accountId: cogsAccount.id,
      debit: { gt: 0 },
      entry: {
        isReversed: false,
        sourceType: "outgoing_shipment",
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
    },
    include: {
      entry: true,
    },
    orderBy: { entry: { date: "desc" } },
    take: 500,
  });

  const truncated = lines.length === 500;

  // Collect unique document IDs from journal entries
  // sourceType is the document type (e.g. "outgoing_shipment"), sourceId is the document ID
  const docIds = [...new Set(
    lines
      .filter((l) => l.entry.sourceId)
      .map((l) => l.entry.sourceId!)
  )];

  // Fetch documents by IDs, scoped to tenant
  const docsMap = new Map<string, {
    id: string; number: string; type: string; status: string;
    counterparty: { name: string } | null;
    warehouse: { name: string } | null;
  }>();

  if (docIds.length > 0) {
    const docs = await db.document.findMany({
      where: { id: { in: docIds }, tenantId },
      include: {
        counterparty: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    for (const d of docs) docsMap.set(d.id, d);
  }

  const documents = lines
    .filter((l) => l.entry.sourceId && docsMap.has(l.entry.sourceId))
    .map((l) => {
      const doc = docsMap.get(l.entry.sourceId!)!;
      return {
        id: doc.id,
        number: doc.number,
        type: doc.type as string,
        date: l.entry.date.toISOString(),
        amount: toNumber(l.debit),
        counterparty: doc.counterparty?.name ?? null,
        warehouse: doc.warehouse?.name ?? null,
        status: doc.status as string,
      };
    });

  return NextResponse.json({
    documents,
    payments: [],
    category: "cogs",
    truncated,
    message: "Сумма себестоимости из проводок Дт 90.2 (средняя стоимость товаров)",
  });
}

async function getReceivablesDrillDown() {
  // Get counterparties with positive balance (they owe us)
  const balances = await FinanceReportService.getReceivablesBalances();

  const items = balances.map((b) => ({
    id: b.counterparty.id,
    number: b.counterparty.name,
    type: "counterparty_balance",
    date: new Date().toISOString(),
    amount: b.balanceRub,
    counterparty: b.counterparty.name,
    counterpartyType: b.counterparty.type,
    isBalance: true,
  }));

  return NextResponse.json({ 
    documents: [], 
    payments: [],
    balances: items,
    category: "assets.receivables",
    message: "Дебиторская задолженность — текущее сальдо контрагентов",
  });
}

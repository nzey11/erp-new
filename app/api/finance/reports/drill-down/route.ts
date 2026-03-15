import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { db } from "@/lib/shared/db";
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
  // Cash Flow
  "operating.in": ["incoming_payment"],
  "operating.out": ["outgoing_payment"],
  // Balance Sheet - stock movements
  "assets.stock.incoming": ["incoming_shipment", "stock_receipt", "customer_return"],
  "assets.stock.outgoing": ["outgoing_shipment", "write_off", "supplier_return"],
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
    const documents = await db.document.findMany({
      where: {
        type: { in: docTypes },
        status: "confirmed",
        tenantId: session.tenantId,
        ...dateFilter,
      },
      include: {
        counterparty: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 500,
    });

    const truncated = documents.length === 500;

    // Also fetch payments from Payment table for cash flow
    const payments = [];
    if (category === "operating.in" || category === "operating.out") {
      const paymentType = category === "operating.in" ? "income" : "expense";
      const paymentDateFilter: { date?: { gte?: Date; lte?: Date } } = {};
      
      if (dateFrom && dateTo) {
        paymentDateFilter.date = { 
          gte: new Date(dateFrom), 
          lte: new Date(dateTo) 
        };
      }

      const paymentResults = await db.payment.findMany({
        where: {
          type: paymentType,
          tenantId: session.tenantId,
          ...paymentDateFilter,
        },
        include: {
          counterparty: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          document: { select: { id: true, number: true, type: true } },
        },
        orderBy: { date: "desc" },
        take: 500,
      });
      payments.push(...paymentResults);
    }

    const paymentsTruncated = payments.length === 500;

    // Format response
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

async function getReceivablesDrillDown() {
  // Get counterparties with positive balance (they owe us)
  const balances = await db.counterpartyBalance.findMany({
    where: { balanceRub: { gt: 0 } },
    include: { 
      counterparty: { 
        select: { id: true, name: true, type: true } 
      } 
    },
    orderBy: { balanceRub: "desc" },
  });

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

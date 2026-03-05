import { NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

function getMonthRange(monthsAgo: number): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export async function GET() {
  try {
    await requirePermission("reports:read");

    const current = getMonthRange(0);
    const prev = getMonthRange(1);

    const [curSales, prevSales, curPurchases, prevPurchases] = await Promise.all([
      db.document.aggregate({
        where: { type: "outgoing_shipment", status: "confirmed", date: { gte: current.from, lte: current.to } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      db.document.aggregate({
        where: { type: "outgoing_shipment", status: "confirmed", date: { gte: prev.from, lte: prev.to } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      db.document.aggregate({
        where: { type: "incoming_shipment", status: "confirmed", date: { gte: current.from, lte: current.to } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      db.document.aggregate({
        where: { type: "incoming_shipment", status: "confirmed", date: { gte: prev.from, lte: prev.to } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    const calcDelta = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : null;

    const curSalesAmount = curSales._sum.totalAmount ?? 0;
    const prevSalesAmount = prevSales._sum.totalAmount ?? 0;
    const curPurchasesAmount = curPurchases._sum.totalAmount ?? 0;
    const prevPurchasesAmount = prevPurchases._sum.totalAmount ?? 0;

    return NextResponse.json({
      currentMonth: {
        label: current.from.toLocaleString("ru-RU", { month: "long", year: "numeric" }),
        sales: { amount: curSalesAmount, count: curSales._count.id, delta: calcDelta(curSalesAmount, prevSalesAmount) },
        purchases: { amount: curPurchasesAmount, count: curPurchases._count.id, delta: calcDelta(curPurchasesAmount, prevPurchasesAmount) },
      },
      previousMonth: {
        label: prev.from.toLocaleString("ru-RU", { month: "long", year: "numeric" }),
        sales: { amount: prevSalesAmount, count: prevSales._count.id },
        purchases: { amount: prevPurchasesAmount, count: prevPurchases._count.id },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

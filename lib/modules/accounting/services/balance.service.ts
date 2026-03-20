/**
 * Balance Service
 *
 * Application service for counterparty balance operations.
 * Owns all write operations related to counterparty balances.
 */

import { db } from "@/lib/shared/db";
import type { Decimal } from "@prisma/client/runtime/client";

/** Helper to convert Decimal or number to number for calculations */
function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

/**
 * Recalculate counterparty balance from confirmed documents.
 *
 * Positive balance = they owe us (accounts receivable)
 * Negative balance = we owe them (accounts payable)
 *
 * + outgoing_shipment  (we shipped -> they owe us)
 * - customer_return    (customer returned -> reduce their debt)
 * - incoming_payment   (customer paid -> reduce their debt)
 * - incoming_shipment  (supplier shipped to us -> we owe them)
 * + supplier_return    (we returned to supplier -> reduce our debt)
 * + outgoing_payment   (we paid supplier -> reduce our debt)
 */
export async function recalculateBalance(counterpartyId: string): Promise<number> {
  console.log(`[BALANCE DEBUG] recalculateBalance START for counterpartyId=${counterpartyId}`);

  const outgoingShipments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "outgoing_shipment", status: "confirmed" },
  });

  const customerReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "customer_return", status: "confirmed" },
  });

  const incomingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "incoming_payment", status: "confirmed" },
  });

  const incomingShipments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "incoming_shipment", status: "confirmed" },
  });

  const supplierReturns = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "supplier_return", status: "confirmed" },
  });

  const outgoingPayments = await db.document.aggregate({
    _sum: { totalAmount: true },
    where: { counterpartyId, type: "outgoing_payment", status: "confirmed" },
  });

  const balanceRub =
    toNumber(outgoingShipments._sum.totalAmount) -
    toNumber(customerReturns._sum.totalAmount) -
    toNumber(incomingPayments._sum.totalAmount) -
    toNumber(incomingShipments._sum.totalAmount) +
    toNumber(supplierReturns._sum.totalAmount) +
    toNumber(outgoingPayments._sum.totalAmount);

  console.log(`[BALANCE DEBUG] recalculateBalance CALC for ${counterpartyId}:`);
  console.log(`  outgoingShipments=${toNumber(outgoingShipments._sum.totalAmount)}`);
  console.log(`  customerReturns=${toNumber(customerReturns._sum.totalAmount)}`);
  console.log(`  incomingPayments=${toNumber(incomingPayments._sum.totalAmount)}`);
  console.log(`  incomingShipments=${toNumber(incomingShipments._sum.totalAmount)}`);
  console.log(`  supplierReturns=${toNumber(supplierReturns._sum.totalAmount)}`);
  console.log(`  outgoingPayments=${toNumber(outgoingPayments._sum.totalAmount)}`);
  console.log(`  TOTAL balanceRub=${balanceRub}`);

  await db.counterpartyBalance.upsert({
    where: { counterpartyId },
    update: { balanceRub },
    create: { counterpartyId, balanceRub },
  });

  console.log(`[BALANCE DEBUG] recalculateBalance END for ${counterpartyId}: balanceRub=${balanceRub}`);

  return balanceRub;
}

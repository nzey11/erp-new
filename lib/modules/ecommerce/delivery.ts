/** Delivery cost calculation. Placeholder for future API integration. */

import { db } from "@/lib/shared/db";

interface DeliveryCalcInput {
  city: string;
  postalCode?: string;
  totalWeight?: number; // kg
  totalVolume?: number; // m3
}

interface DeliveryCalcResult {
  cost: number;
  estimatedDays: number;
  provider: string;
}

/** Calculate delivery cost (stub — replace with real API integration) */
export async function calculateDeliveryCost(input: DeliveryCalcInput): Promise<DeliveryCalcResult> {
  // TODO: Integrate with delivery API (CDEK, Boxberry, etc.)
  // For now, return a flat rate based on volume
  const baseCost = 300;
  const volumeCost = (input.totalVolume || 0) * 500;
  const cost = Math.round(baseCost + volumeCost);

  return {
    cost,
    estimatedDays: 3,
    provider: "Стандартная доставка",
  };
}

/** Get pickup warehouses */
export async function getPickupWarehouses() {
  return db.warehouse.findMany({
    where: { isActive: true },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  });
}

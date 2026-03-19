"use client";
import { useEffect, useState } from "react";
import type { WarehouseRef, CounterpartyRef } from "@/lib/modules/accounting";

export function useAccountingRefs(counterpartyLimit = 500) {
  const [warehouses, setWarehouses] = useState<WarehouseRef[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyRef[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounting/warehouses?active=true").then((r) => r.json()),
      fetch(`/api/accounting/counterparties?limit=${counterpartyLimit}`).then((r) => r.json()),
    ]).then(([wh, cp]) => {
      setWarehouses(Array.isArray(wh) ? wh : []);
      setCounterparties(Array.isArray(cp?.data) ? cp.data : []);
    });
  }, [counterpartyLimit]);

  return { warehouses, counterparties };
}

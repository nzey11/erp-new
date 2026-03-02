"use client";

import { PageHeader } from "@/components/page-header";
import { CounterpartiesTable } from "@/components/accounting";

export default function CounterpartiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Контрагенты" />
      <CounterpartiesTable />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "antd";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateDocumentDialog } from "@/components/domain/accounting";
import type { StockFilters } from "@/lib/domain/stock/parse-filters";
import type { GetStockBalancesResult } from "@/lib/domain/stock/queries";
import type { StockDocumentFilters } from "@/lib/domain/stock-documents/parse-filters";
import type { GetStockDocumentsResult } from "@/lib/domain/stock-documents/queries";
import { StockBalancesClient } from "./stock-balances-client";
import { StockDocumentsClient } from "./stock-documents-client";

const STOCK_DOC_TYPES = [
  { value: "stock_transfer", label: "Перемещение" },
  { value: "inventory_count", label: "Инвентаризация" },
  { value: "write_off", label: "Списание" },
  { value: "stock_receipt", label: "Оприходование" },
];

interface Warehouse {
  id: string;
  name: string;
}

interface StockPageClientProps {
  initialData: GetStockBalancesResult;
  initialFilters: StockFilters;
  warehouses: Warehouse[];
  stockDocInitialData: GetStockDocumentsResult;
  stockDocInitialFilters: StockDocumentFilters;
  activeTab: string;
}

// Map tab → default document type for CreateDocumentDialog
const TAB_TO_DOC_TYPE: Record<string, string> = {
  inventory: "inventory_count",
  write_off: "write_off",
  stock_receipt: "stock_receipt",
};

/**
 * Stock page tab orchestrator — client shell.
 *
 * Owns:
 * - Active tab state (URL-driven via ?tab=)
 * - Create document dialog state
 *
 * Balances tab → StockBalancesClient (ERP architecture)
 * Document tabs → StockDocumentsClient (ERP architecture)
 */
export function StockPageClient({
  initialData,
  initialFilters,
  warehouses,
  stockDocInitialData,
  stockDocInitialFilters,
  activeTab: initialTab,
}: StockPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(initialTab);
  const [createOpen, setCreateOpen] = useState(false);
  // Ant Design Tabs doesn't require mounted guard - handles SSR safely

  const isStockDocTab = tab in TAB_TO_DOC_TYPE;
  const showCreateButton = isStockDocTab;

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    // Update URL with tab param
    const params = new URLSearchParams(searchParams.toString());
    if (newTab === "balances") {
      params.delete("tab");
    } else {
      params.set("tab", newTab);
    }
    // Reset page on tab change
    params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const tabItems = [
    {
      key: "balances",
      label: "Остатки",
      children: (
        <StockBalancesClient
          initialData={initialData}
          initialFilters={initialFilters}
          warehouses={warehouses}
        />
      ),
    },
    {
      key: "inventory",
      label: "Инвентаризации",
      children: (
        <StockDocumentsClient
          initialData={stockDocInitialData}
          initialFilters={stockDocInitialFilters}
          warehouses={warehouses}
        />
      ),
    },
    {
      key: "write_off",
      label: "Списания",
      children: (
        <StockDocumentsClient
          initialData={stockDocInitialData}
          initialFilters={stockDocInitialFilters}
          warehouses={warehouses}
        />
      ),
    },
    {
      key: "stock_receipt",
      label: "Оприходования",
      children: (
        <StockDocumentsClient
          initialData={stockDocInitialData}
          initialFilters={stockDocInitialFilters}
          warehouses={warehouses}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Склад"
        description="Товарные остатки и складские операции"
        actions={
          showCreateButton ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Новый документ
            </Button>
          ) : undefined
        }
      />

      {/* Tab switcher with content */}
      <Tabs activeKey={tab} onChange={handleTabChange} items={tabItems} />

      {/* Create document dialog */}
      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый складской документ"
        docTypes={STOCK_DOC_TYPES}
        warehouses={warehouses}
        counterparties={[]}
        requireWarehouse
        showTargetWarehouse
        defaultType={TAB_TO_DOC_TYPE[tab]}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

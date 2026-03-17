"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// Stock document tab types
const STOCK_DOC_TABS = ["inventory", "write_off", "stock_receipt"];

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
  // Radix UI SSR safety: prevent hydration mismatch from non-deterministic IDs
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isStockDocTab = STOCK_DOC_TABS.includes(tab);
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

      {/* Tab switcher */}
      {mounted && (
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="balances">Остатки</TabsTrigger>
            <TabsTrigger value="inventory">Инвентаризации</TabsTrigger>
            <TabsTrigger value="write_off">Списания</TabsTrigger>
            <TabsTrigger value="stock_receipt">Оприходования</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Balances tab — ERP architecture */}
      {tab === "balances" && (
        <StockBalancesClient
          initialData={initialData}
          initialFilters={initialFilters}
          warehouses={warehouses}
        />
      )}

      {/* Document tabs — ERP architecture */}
      {isStockDocTab && mounted && (
        <StockDocumentsClient
          initialData={stockDocInitialData}
          initialFilters={stockDocInitialFilters}
          warehouses={warehouses}
        />
      )}

      {/* Create document dialog */}
      {mounted && (
        <CreateDocumentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Новый складской документ"
          docTypes={STOCK_DOC_TYPES}
          warehouses={warehouses}
          counterparties={[]}
          requireWarehouse
          showTargetWarehouse
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}

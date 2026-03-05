"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { DocumentsTable, DOC_TYPE_OPTIONS, CreateDocumentDialog } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";

const PURCHASE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "purchases");

export default function PurchasesPage() {
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const tableRef = useRef<DocumentsTableHandle>(null);
  const { warehouses, counterparties } = useAccountingRefs();

  // Determine groupFilter/typeFilter based on tab
  const getFilterProps = () => {
    switch (tab) {
      case "purchase_order": return { groupFilter: "", typeFilter: "purchase_order" };
      case "incoming_shipment": return { groupFilter: "", typeFilter: "incoming_shipment" };
      case "supplier_return": return { groupFilter: "", typeFilter: "supplier_return" };
      default: return { groupFilter: "purchases", typeFilter: "" };
    }
  };

  const filterProps = getFilterProps();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Закупки"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новый документ
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Все закупки</TabsTrigger>
          <TabsTrigger value="purchase_order">Заказы поставщикам</TabsTrigger>
          <TabsTrigger value="incoming_shipment">Приёмки</TabsTrigger>
          <TabsTrigger value="supplier_return">Возвраты</TabsTrigger>
        </TabsList>
      </Tabs>

      <DocumentsTable
        ref={tableRef}
        key={tab}
        groupFilter={filterProps.groupFilter}
        defaultTypeFilter={filterProps.typeFilter}
      />

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый документ закупки"
        docTypes={PURCHASE_TYPES}
        warehouses={warehouses}
        counterparties={counterparties}
        onSuccess={() => tableRef.current?.refresh()}
        counterpartyRedirect="purchases"
      />
    </div>
  );
}

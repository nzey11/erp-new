"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { DocumentsTable, DOC_TYPE_OPTIONS, CreateDocumentDialog } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { useAccountingRefs } from "@/lib/hooks/use-accounting-refs";

export default function DocumentsPage() {
  const [groupFilter, setGroupFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const tableRef = useRef<DocumentsTableHandle>(null);

  const { warehouses, counterparties } = useAccountingRefs();

  const filteredTypes = groupFilter
    ? DOC_TYPE_OPTIONS.filter((t) => t.group === groupFilter)
    : DOC_TYPE_OPTIONS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Документы"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новый документ
          </Button>
        }
      />

      {/* Group filter tabs */}
      <Tabs value={groupFilter || "all"} onValueChange={(v) => setGroupFilter(v === "all" ? "" : v)}>
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="stock">Склад</TabsTrigger>
          <TabsTrigger value="purchases">Закупки</TabsTrigger>
          <TabsTrigger value="sales">Продажи</TabsTrigger>
          <TabsTrigger value="finance">Финансы</TabsTrigger>
        </TabsList>
      </Tabs>

      <DocumentsTable ref={tableRef} key={groupFilter} groupFilter={groupFilter} />

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый документ"
        docTypes={filteredTypes}
        warehouses={warehouses}
        counterparties={counterparties}
        onSuccess={() => tableRef.current?.refresh()}
        showTargetWarehouse
        counterpartyRedirect="documents"
      />
    </div>
  );
}

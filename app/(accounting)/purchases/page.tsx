"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { DocumentsTable, DOC_TYPE_OPTIONS } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";

const PURCHASE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "purchases");

interface Warehouse { id: string; name: string }
interface Counterparty { id: string; name: string }

export default function PurchasesPage() {
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);

  const tableRef = useRef<DocumentsTableHandle>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createCounterpartyId, setCreateCounterpartyId] = useState("");

  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch("/api/accounting/warehouses").then((r) => r.json()),
      fetch("/api/accounting/counterparties?limit=500").then((r) => r.json()),
    ]).then(([wh, cp]) => {
      setWarehouses(wh || []);
      setCounterparties(cp.data || []);
    });
  }, []);

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { type: createType, items: [] };
      if (createWarehouseId) body.warehouseId = createWarehouseId;
      if (createCounterpartyId) body.counterpartyId = createCounterpartyId;

      const res = await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Документ создан");
      setCreateOpen(false);
      setCreateType("");
      setCreateWarehouseId("");
      setCreateCounterpartyId("");
      tableRef.current?.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый документ закупки</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger data-testid="doc-type-select"><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {PURCHASE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createType && (
              <div className="grid gap-2">
                <Label>Склад</Label>
                <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createType && (
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <div className="flex gap-2">
                  <Select value={createCounterpartyId} onValueChange={setCreateCounterpartyId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Выберите контрагента" /></SelectTrigger>
                    <SelectContent>
                      {counterparties.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Создать нового контрагента"
                    onClick={() => router.push("/counterparties/new?redirect=purchases")}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

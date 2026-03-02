"use client";

import { useEffect, useState } from "react";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DocumentsTable, DOC_TYPE_OPTIONS } from "@/components/accounting";

interface Warehouse { id: string; name: string }
interface Counterparty { id: string; name: string }

export default function DocumentsPage() {
  const [groupFilter, setGroupFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createTargetWarehouseId, setCreateTargetWarehouseId] = useState("");
  const [createCounterpartyId, setCreateCounterpartyId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const filteredTypes = groupFilter
    ? DOC_TYPE_OPTIONS.filter((t) => t.group === groupFilter)
    : DOC_TYPE_OPTIONS;

  useEffect(() => {
    Promise.all([
      fetch("/api/accounting/warehouses").then((r) => r.json()),
      fetch("/api/accounting/counterparties?limit=100").then((r) => r.json()),
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
      if (createTargetWarehouseId) body.targetWarehouseId = createTargetWarehouseId;
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
      setCreateTargetWarehouseId("");
      setCreateCounterpartyId("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

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

      <DocumentsTable key={`${refreshKey}-${groupFilter}`} groupFilter={groupFilter} />

      {/* Create Document Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый документ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {filteredTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createType && createType !== "incoming_payment" && createType !== "outgoing_payment" && (
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
            {createType === "stock_transfer" && (
              <div className="grid gap-2">
                <Label>Склад-получатель</Label>
                <Select value={createTargetWarehouseId} onValueChange={setCreateTargetWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createType && [
              "purchase_order", "incoming_shipment", "supplier_return",
              "sales_order", "outgoing_shipment", "customer_return",
              "incoming_payment", "outgoing_payment",
            ].includes(createType) && (
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <Select value={createCounterpartyId} onValueChange={setCreateCounterpartyId}>
                  <SelectTrigger><SelectValue placeholder="Выберите контрагента" /></SelectTrigger>
                  <SelectContent>
                    {counterparties.map((cp) => (
                      <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

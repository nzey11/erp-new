"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatRub } from "@/lib/shared/utils";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { csrfFetch } from "@/lib/client/csrf";

interface StockRecord {
  id: string;
  quantity: number;
  averageCost: number;
  product: { id: string; name: string; sku: string | null };
  warehouse: { id: string; name: string };
}

interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  responsibleName: string | null;
  isActive: boolean;
  stockRecords?: StockRecord[];
}

export default function WarehousesPage() {
  const grid = useDataGrid<Warehouse>({
    endpoint: "/api/accounting/warehouses",
    enablePagination: false,
    enableSearch: false,
    responseAdapter: (json) => ({ data: Array.isArray(json) ? json as Warehouse[] : [], total: 0 }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [stockRecords, setStockRecords] = useState<StockRecord[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formResponsible, setFormResponsible] = useState("");

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setFormResponsible("");
    setDialogOpen(true);
  };

  const openEdit = (wh: Warehouse) => {
    setEditing(wh);
    setFormName(wh.name);
    setFormAddress(wh.address || "");
    setFormResponsible(wh.responsibleName || "");
    setDialogOpen(true);
  };

  const openDelete = (wh: Warehouse) => {
    setDeletingWarehouse(wh);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingWarehouse) return;
    setDeleting(true);
    try {
      const res = await csrfFetch(`/api/accounting/warehouses/${deletingWarehouse.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка удаления");
      }
      toast.success(`Склад «${deletingWarehouse.name}» деактивирован`);
      setDeleteDialogOpen(false);
      setDeletingWarehouse(null);
      grid.mutate.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  };

  const viewStock = async (wh: Warehouse) => {
    setSelectedWarehouse(wh);
    setStockDialogOpen(true);
    try {
      const res = await fetch(`/api/accounting/warehouses/${wh.id}`);
      const data = await res.json();
      setStockRecords(data.stockRecords || []);
    } catch {
      toast.error("Ошибка загрузки остатков");
    }
  };

  const handleSave = async () => {
    if (!formName) {
      toast.error("Название обязательно");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: formName,
        address: formAddress || null,
        responsibleName: formResponsible || null,
      };
      const res = editing
        ? await csrfFetch(`/api/accounting/warehouses/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await csrfFetch("/api/accounting/warehouses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success(editing ? "Склад обновлён" : "Склад создан");
      setDialogOpen(false);
      grid.mutate.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const columns: DataGridColumn<Warehouse>[] = [
    {
      accessorKey: "name",
      header: "Название",
      size: 200,
      meta: { canHide: false },
      cell: ({ row }) => (
        <button className="font-medium hover:underline text-left" onClick={(e) => { e.stopPropagation(); viewStock(row.original); }}>
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "address",
      header: "Адрес",
      size: 250,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.address || "—"}</span>,
    },
    {
      accessorKey: "responsibleName",
      header: "Ответственный",
      size: 200,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.responsibleName || "—"}</span>,
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      size: 120,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? "Активен" : "Неактивен"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 100,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); openDelete(row.original); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Склады"
        description={`Всего: ${grid.data.length}`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить склад
          </Button>
        }
      />

      <DataGrid
        {...grid.gridProps}
        columns={columns}
        emptyMessage="Нет складов"
        persistenceKey="warehouses"
        stickyHeader={false}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать склад" : "Новый склад"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Адрес</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Ответственный</Label>
              <Input value={formResponsible} onChange={(e) => setFormResponsible(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleting) setDeleteDialogOpen(open); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Деактивировать склад?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Склад <span className="font-medium text-foreground">«{deletingWarehouse?.name}»</span> будет
            деактивирован. Документы и остатки сохранятся.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Деактивация..." : "Деактивировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Остатки: {selectedWarehouse?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Артикул</TableHead>
                  <TableHead className="text-right">Количество</TableHead>
                  <TableHead className="text-right">Средн. себест.</TableHead>
                  <TableHead className="text-right">Стоимость</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                      Нет остатков
                    </TableCell>
                  </TableRow>
                ) : (
                  stockRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.product.sku || "—"}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.quantity)}</TableCell>
                      <TableCell className="text-right">
                        {r.averageCost > 0 ? formatRub(r.averageCost) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.averageCost > 0 ? formatRub(r.quantity * r.averageCost) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "antd";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { Tag, Table, type TableColumnsType, Modal, Input, Typography } from "antd";
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

  const stockColumns: TableColumnsType<StockRecord> = [
    { key: "product", dataIndex: ["product", "name"], title: "Товар", render: (name: string) => <span className="font-medium">{name}</span> },
    { key: "sku", dataIndex: ["product", "sku"], title: "Артикул", render: (sku: string | null) => <span className="text-muted-foreground">{sku || "—"}</span> },
    { key: "quantity", dataIndex: "quantity", title: "Количество", align: "right", render: (qty: number) => formatNumber(qty) },
    { key: "averageCost", dataIndex: "averageCost", title: "Средн. себест.", align: "right", render: (cost: number) => (cost > 0 ? formatRub(cost) : "—") },
    {
      key: "totalCost",
      title: "Стоимость",
      align: "right",
      render: (_, r) => (r.averageCost > 0 ? formatRub(r.quantity * r.averageCost) : "—"),
    },
  ];

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
        <Tag color={row.original.isActive ? "blue" : "default"}>
          {row.original.isActive ? "Активен" : "Неактивен"}
        </Tag>
      ),
    },
    {
      id: "actions",
      size: 100,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="text"
            size="small"
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
      <Modal
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onOk={handleSave}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editing ? "Редактировать склад" : "Новый склад"}
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Typography.Text strong>Название *</Typography.Text>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Адрес</Typography.Text>
            <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Ответственный</Typography.Text>
            <Input value={formResponsible} onChange={(e) => setFormResponsible(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <Modal
        open={deleteDialogOpen}
        onCancel={() => { if (!deleting) setDeleteDialogOpen(false); }}
        onOk={handleDelete}
        okButtonProps={{ disabled: deleting, loading: deleting, danger: true }}
        okText={deleting ? "Деактивация..." : "Деактивировать"}
        cancelText="Отмена"
        title="Деактивировать склад?"
      >
        <p className="text-sm text-muted-foreground py-2">
          Склад <span className="font-medium text-foreground">«{deletingWarehouse?.name}»</span> будет
          деактивирован. Документы и остатки сохранятся.
        </p>
      </Modal>

      {/* Stock Dialog - no footer, just display */}
      <Modal
        open={stockDialogOpen}
        onCancel={() => setStockDialogOpen(false)}
        footer={null}
        title={`Остатки: ${selectedWarehouse?.name}`}
        width={700}
      >
        <div className="max-h-96 overflow-y-auto">
          <Table
            columns={stockColumns}
            dataSource={stockRecords}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: "Нет остатков" }}
          />
        </div>
      </Modal>
    </div>
  );
}

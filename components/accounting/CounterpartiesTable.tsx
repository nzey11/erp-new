"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

export interface Counterparty {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
  balance: { balanceRub: number } | null;
}

export const TYPE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель/Поставщик",
};

interface CounterpartiesTableProps {
  onCounterpartySelect?: (counterparty: Counterparty) => void;
}

export function CounterpartiesTable({ onCounterpartySelect }: CounterpartiesTableProps) {
  const grid = useDataGrid<Counterparty>({
    endpoint: "/api/accounting/counterparties",
    pageSize: 50,
    enablePagination: true,
    enableSearch: true,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Counterparty | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    type: "customer",
    name: "",
    legalName: "",
    inn: "",
    kpp: "",
    phone: "",
    email: "",
    contactPerson: "",
    address: "",
    notes: "",
  });

  const setField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ type: "customer", name: "", legalName: "", inn: "", kpp: "", phone: "", email: "", contactPerson: "", address: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: Counterparty) => {
    setEditing(item);
    setForm({
      type: item.type,
      name: item.name,
      legalName: item.legalName || "",
      inn: item.inn || "",
      kpp: "",
      phone: item.phone || "",
      email: item.email || "",
      contactPerson: item.contactPerson || "",
      address: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Название обязательно");
      return;
    }
    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/accounting/counterparties/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        : await fetch("/api/accounting/counterparties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success(editing ? "Контрагент обновлён" : "Контрагент создан");
      setDialogOpen(false);
      grid.mutate.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const columns: DataGridColumn<Counterparty>[] = [
    {
      accessorKey: "name",
      header: "Название",
      size: 220,
      meta: { canHide: false },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "Тип",
      size: 160,
      cell: ({ row }) => (
        <Badge variant="outline">{TYPE_LABELS[row.original.type] || row.original.type}</Badge>
      ),
    },
    {
      accessorKey: "inn",
      header: "ИНН",
      size: 140,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.inn || "—"}</span>,
    },
    {
      accessorKey: "phone",
      header: "Телефон",
      size: 150,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      id: "balance",
      header: "Баланс",
      size: 140,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const b = row.original.balance;
        if (!b) return <span className="text-muted-foreground">0</span>;
        return (
          <span className={b.balanceRub >= 0 ? "text-green-600" : "text-red-600"}>
            {formatRub(b.balanceRub)}
          </span>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      size: 110,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? "Активен" : "Неактивен"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 50,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataGrid
        {...grid.gridProps}
        columns={columns}
        emptyMessage={grid.search ? "Ничего не найдено" : "Нет контрагентов"}
        persistenceKey="counterparties"
        onRowClick={onCounterpartySelect}
        getRowClassName={() => onCounterpartySelect ? "cursor-pointer" : ""}
        toolbar={{
          ...grid.gridProps.toolbar,
          search: {
            value: grid.search,
            onChange: grid.setSearch,
            placeholder: "Поиск по названию, ИНН, телефону...",
          },
          actions: <Button onClick={openCreate}>Добавить</Button>,
        }}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать контрагента" : "Новый контрагент"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={(v) => setField("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Покупатель</SelectItem>
                  <SelectItem value="supplier">Поставщик</SelectItem>
                  <SelectItem value="both">Покупатель/Поставщик</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Юридическое название</Label>
                <Input value={form.legalName} onChange={(e) => setField("legalName", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>ИНН</Label>
                <Input value={form.inn} onChange={(e) => setField("inn", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Контактное лицо</Label>
              <Input value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Заметки</Label>
              <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

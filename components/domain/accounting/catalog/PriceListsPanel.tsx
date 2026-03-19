"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, Table, type TableColumnsType, Input, Typography, Button } from "antd";
const { TextArea } = Input;
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
import { cn } from "@/lib/shared/utils";

interface PriceList {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { prices: number };
}

interface PriceListsPanelProps {
  onSelectPriceList: (priceList: PriceList | null) => void;
  selectedPriceListId: string | null;
}

export function PriceListsPanel({ onSelectPriceList, selectedPriceListId }: PriceListsPanelProps) {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<PriceList | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPriceLists = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/price-lists");
      if (!res.ok) { setPriceLists([]); return; }
      const data = await res.json();
      setPriceLists(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Ошибка загрузки прайс-листов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPriceLists();
  }, [loadPriceLists]);

  const openCreate = () => {
    setEditingPriceList(null);
    setFormName("");
    setFormDescription("");
    setDialogOpen(true);
  };

  const openEdit = (pl: PriceList, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPriceList(pl);
    setFormName(pl.name);
    setFormDescription(pl.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Название обязательно");
      return;
    }
    setSaving(true);
    try {
      const body = { name: formName, description: formDescription || null };
      const res = editingPriceList
        ? await csrfFetch(`/api/accounting/price-lists/${editingPriceList.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await csrfFetch("/api/accounting/price-lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingPriceList ? "Прайс-лист обновлён" : "Прайс-лист создан");
      setDialogOpen(false);
      loadPriceLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<PriceList> = [
    {
      key: "name",
      dataIndex: "name",
      title: "Название",
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      key: "description",
      dataIndex: "description",
      title: "Описание",
      render: (desc: string | null) => <span className="text-muted-foreground">{desc || "—"}</span>,
    },
    {
      key: "prices",
      dataIndex: ["_count", "prices"],
      title: "Товаров",
      align: "right",
      render: (count: number) => count || 0,
    },
    {
      key: "actions",
      title: "",
      width: 100,
      render: (_, pl) => (
        <div className="flex items-center justify-end gap-1">
          <Button type="text" shape="circle" className="h-8 w-8" onClick={(e) => openEdit(pl, e)} icon={<Pencil className="h-4 w-4" />} />
          <Button type="text" shape="circle" className="h-8 w-8 text-destructive" onClick={(e) => handleDelete(pl, e)} icon={<Trash2 className="h-4 w-4" />} />
        </div>
      ),
    },
  ];

  const handleDelete = async (pl: PriceList, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Удалить прайс-лист "${pl.name}"?`)) return;
    try {
      const res = await csrfFetch(`/api/accounting/price-lists/${pl.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Прайс-лист удалён");
      if (selectedPriceListId === pl.id) onSelectPriceList(null);
      loadPriceLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Прайс-листы</h3>
        <Button size="small" type="primary" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
          Новый прайс-лист
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : priceLists.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <p className="mb-2">Нет прайс-листов</p>
          <Button variant="outlined" size="small" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
            Создать первый
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table
            columns={columns}
            dataSource={priceLists}
            rowKey="id"
            pagination={false}
            onRow={(pl) => ({
              onClick: () => onSelectPriceList(pl),
              className: cn("cursor-pointer", selectedPriceListId === pl.id && "bg-muted/50"),
            })}
          />
        </div>
      )}

      <Modal
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onOk={handleSave}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingPriceList ? "Редактировать прайс-лист" : "Новый прайс-лист"}
      >
        <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Typography.Text strong>Название *</Typography.Text>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Розничный прайс"
              />
            </div>
            <div className="grid gap-2">
              <Typography.Text strong>Описание</Typography.Text>
              <TextArea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Описание прайс-листа"
                rows={3}
              />
            </div>
          </div>
      </Modal>
    </div>
  );
}

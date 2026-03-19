"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input as AntdInput } from "antd";
const { TextArea } = AntdInput;
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
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Новый прайс-лист
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : priceLists.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <p className="mb-2">Нет прайс-листов</p>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Создать первый
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead className="text-right">Товаров</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceLists.map((pl) => (
                <TableRow
                  key={pl.id}
                  className={cn(
                    "cursor-pointer",
                    selectedPriceListId === pl.id && "bg-muted/50"
                  )}
                  onClick={() => onSelectPriceList(pl)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {pl.name}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pl.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {pl._count?.prices || 0}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => openEdit(pl, e)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => handleDelete(pl, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPriceList ? "Редактировать прайс-лист" : "Новый прайс-лист"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Розничный прайс"
              />
            </div>
            <div className="grid gap-2">
              <Label>Описание</Label>
              <TextArea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Описание прайс-листа"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

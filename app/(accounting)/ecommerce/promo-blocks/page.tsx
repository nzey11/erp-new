"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";

interface PromoBlock {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PromoBlocksPage() {
  const [promoBlocks, setPromoBlocks] = useState<PromoBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<PromoBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [order, setOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadPromoBlocks();
  }, []);

  const loadPromoBlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounting/ecommerce/promo-blocks");
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setPromoBlocks(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingBlock(null);
    setTitle("");
    setSubtitle("");
    setImageUrl("");
    setLinkUrl("");
    setOrder(promoBlocks.length);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (block: PromoBlock) => {
    setEditingBlock(block);
    setTitle(block.title);
    setSubtitle(block.subtitle || "");
    setImageUrl(block.imageUrl);
    setLinkUrl(block.linkUrl || "");
    setOrder(block.order);
    setIsActive(block.isActive);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !imageUrl.trim()) {
      toast.error("Заполните обязательные поля");
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        imageUrl: imageUrl.trim(),
        linkUrl: linkUrl.trim() || null,
        order,
        isActive,
      };

      const url = editingBlock
        ? `/api/accounting/ecommerce/promo-blocks?id=${editingBlock.id}`
        : "/api/accounting/ecommerce/promo-blocks";

      const res = await csrfFetch(url, {
        method: editingBlock ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка сохранения");
      }

      toast.success(editingBlock ? "Блок обновлён" : "Блок создан");
      setDialogOpen(false);
      await loadPromoBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить промо-блок?")) return;

    setDeleting(id);
    try {
      const res = await csrfFetch(`/api/accounting/ecommerce/promo-blocks?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка удаления");
      }

      toast.success("Блок удалён");
      await loadPromoBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (block: PromoBlock) => {
    try {
      const res = await csrfFetch(`/api/accounting/ecommerce/promo-blocks?id=${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...block, isActive: !block.isActive }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка обновления");
      }

      toast.success(block.isActive ? "Блок деактивирован" : "Блок активирован");
      await loadPromoBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Промо-блоки"
        description="Управление рекламными баннерами в магазине"
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Новый промо-блок
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Изображение</TableHead>
              <TableHead>Заголовок</TableHead>
              <TableHead>Подзаголовок</TableHead>
              <TableHead>Ссылка</TableHead>
              <TableHead className="w-[80px] text-center">Порядок</TableHead>
              <TableHead className="w-[100px]">Статус</TableHead>
              <TableHead className="w-[150px]">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-12 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : promoBlocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Промо-блоки не найдены
                </TableCell>
              </TableRow>
            ) : (
              promoBlocks.map((block) => (
                <TableRow key={block.id}>
                  <TableCell>
                    {block.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={block.imageUrl}
                        alt={block.title}
                        className="w-16 h-16 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center bg-muted rounded border">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{block.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {block.subtitle || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {block.linkUrl ? (
                      <a
                        href={block.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {block.linkUrl.length > 30
                          ? `${block.linkUrl.substring(0, 30)}...`
                          : block.linkUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-center">{block.order}</TableCell>
                  <TableCell>
                    <Badge
                      variant={block.isActive ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => toggleActive(block)}
                    >
                      {block.isActive ? "Активен" : "Неактивен"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(block)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(block.id)}
                        disabled={deleting === block.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBlock ? "Редактировать промо-блок" : "Новый промо-блок"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Заголовок *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Летняя распродажа"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subtitle">Подзаголовок</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Скидки до 50%"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="imageUrl">URL изображения *</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linkUrl">Ссылка</Label>
              <Input
                id="linkUrl"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order">Порядок сортировки</Label>
              <Input
                id="order"
                type="number"
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Активен
              </Label>
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

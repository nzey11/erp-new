"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tag, Card, Modal, Table, Input, Typography } from "antd";
import type { TableColumnsType } from "antd";
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

  const columns: TableColumnsType<PromoBlock> = [
    {
      key: "image",
      dataIndex: "imageUrl",
      title: "Изображение",
      width: 100,
      render: (imageUrl: string, block) =>
        imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={block.title}
            className="w-16 h-16 object-cover rounded border"
          />
        ) : (
          <div className="w-16 h-16 flex items-center justify-center bg-muted rounded border">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        ),
    },
    {
      key: "title",
      dataIndex: "title",
      title: "Заголовок",
      render: (title: string) => <span className="font-medium">{title}</span>,
    },
    {
      key: "subtitle",
      dataIndex: "subtitle",
      title: "Подзаголовок",
      render: (subtitle: string | null) => (
        <span className="text-sm text-muted-foreground">{subtitle || "—"}</span>
      ),
    },
    {
      key: "linkUrl",
      dataIndex: "linkUrl",
      title: "Ссылка",
      render: (linkUrl: string | null) =>
        linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            {linkUrl.length > 30 ? `${linkUrl.substring(0, 30)}...` : linkUrl}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "order",
      dataIndex: "order",
      title: "Порядок",
      width: 80,
      align: "center",
    },
    {
      key: "status",
      dataIndex: "isActive",
      title: "Статус",
      width: 100,
      render: (isActive: boolean, block) => (
        <Tag
          color={isActive ? "blue" : "default"}
          className="cursor-pointer"
          onClick={() => toggleActive(block)}
        >
          {isActive ? "Активен" : "Неактивен"}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: "Действия",
      width: 150,
      render: (_, block) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openEditDialog(block)}>
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
      ),
    },
  ];

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
        <Table
          columns={columns}
          dataSource={promoBlocks}
          rowKey="id"
          pagination={false}
          loading={loading}
          locale={{ emptyText: "Промо-блоки не найдены" }}
        />
      </Card>

      {/* Create/Edit Dialog */}
      <Modal
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onOk={handleSave}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingBlock ? "Редактировать промо-блок" : "Новый промо-блок"}
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Typography.Text strong>Заголовок *</Typography.Text>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Летняя распродажа"
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Подзаголовок</Typography.Text>
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Скидки до 50%"
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>URL изображения *</Typography.Text>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Ссылка</Typography.Text>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Порядок сортировки</Typography.Text>
            <Input
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
            <Typography.Text strong className="cursor-pointer">
              Активен
            </Typography.Text>
          </div>
        </div>
      </Modal>
    </div>
  );
}

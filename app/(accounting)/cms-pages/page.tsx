"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button, Input, Tag } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
import { formatDate } from "@/lib/shared/utils";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

interface StorePage {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  sortOrder: number;
  showInFooter: boolean;
  showInHeader: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CmsPagesListPage() {
  const router = useRouter();
  const grid = useDataGrid<StorePage>({
    endpoint: "/api/accounting/cms-pages",
    enablePagination: false,
    enableSearch: true,
  });

  const [deleting, setDeleting] = useState<string | null>(null);

  const handleTogglePublish = async (page: StorePage) => {
    try {
      const res = await csrfFetch(`/api/accounting/cms-pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !page.isPublished }),
      });
      if (!res.ok) throw new Error("Ошибка обновления");
      toast.success(page.isPublished ? "Страница снята с публикации" : "Страница опубликована");
      await grid.mutate.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить страницу? Это действие необратимо.")) return;
    setDeleting(id);
    try {
      const res = await csrfFetch(`/api/accounting/cms-pages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Ошибка удаления");
      toast.success("Страница удалена");
      await grid.mutate.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setDeleting(null);
    }
  };

  const columns: ERPColumn<StorePage>[] = [
    {
      key: "title",
      dataIndex: "title",
      title: "Заголовок",
      width: 250,
      render: (_, row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "slug",
      dataIndex: "slug",
      title: "Slug",
      width: 220,
      render: (_, row) => (
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          /store/pages/{row.slug}
        </code>
      ),
    },
    {
      key: "sortOrder",
      dataIndex: "sortOrder",
      title: "Порядок",
      width: 80,
      align: "center",
      render: (_, row) => row.sortOrder,
    },
    {
      key: "isPublished",
      dataIndex: "isPublished",
      title: "Статус",
      width: 120,
      render: (_, row) => (
        <Tag
          color={row.isPublished ? "blue" : "default"}
          className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); handleTogglePublish(row); }}
        >
          {row.isPublished ? "Опубликовано" : "Черновик"}
        </Tag>
      ),
    },
    {
      key: "showInFooter",
      dataIndex: "showInFooter",
      title: "Футер",
      width: 80,
      render: (_, row) => (
        <span className="text-sm text-muted-foreground">
          {row.showInFooter ? "Да" : "Нет"}
        </span>
      ),
    },
    {
      key: "updatedAt",
      dataIndex: "updatedAt",
      title: "Дата",
      width: 120,
      render: (_, row) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      title: "Действия",
      width: 150,
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => router.push(`/cms-pages/${row.id}`)}
            title="Редактировать"
            icon={<Pencil className="h-3 w-3" />}
          />
          {row.isPublished && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => window.open(`/store/pages/${row.slug}`, "_blank")}
              title="Открыть на сайте"
              icon={<ExternalLink className="h-3 w-3" />}
            />
          )}
          <Button
            size="small"
            danger
            onClick={() => handleDelete(row.id)}
            disabled={deleting === row.id}
            title="Удалить"
            icon={<Trash2 className="h-3 w-3" />}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="CMS-страницы"
        description="Управление статическими страницами магазина"
      />

      <ERPToolbar
        onCreateClick={() => router.push("/cms-pages/new")}
        createLabel="Новая страница"
        extraActions={
          <Input
            placeholder="Поиск по заголовку..."
            value={grid.search}
            onChange={(e) => grid.setSearch(e.target.value)}
            style={{ width: 250 }}
          />
        }
      />

      <ERPTable
        data={grid.data}
        columns={columns}
        loading={grid.loading}
        emptyText={grid.search ? "Страницы не найдены" : "Нет созданных страниц"}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
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
      const res = await fetch(`/api/accounting/cms-pages/${page.id}`, {
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
      const res = await fetch(`/api/accounting/cms-pages/${id}`, {
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

  const columns: DataGridColumn<StorePage>[] = [
    {
      accessorKey: "title",
      header: "Заголовок",
      size: 250,
      meta: { canHide: false },
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: "slug",
      header: "Slug",
      size: 220,
      cell: ({ row }) => (
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          /store/pages/{row.original.slug}
        </code>
      ),
    },
    {
      accessorKey: "sortOrder",
      header: "Порядок",
      size: 80,
      meta: { align: "center" as const },
      cell: ({ row }) => row.original.sortOrder,
    },
    {
      accessorKey: "isPublished",
      header: "Статус",
      size: 120,
      cell: ({ row }) => (
        <Badge
          variant={row.original.isPublished ? "default" : "secondary"}
          className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); handleTogglePublish(row.original); }}
        >
          {row.original.isPublished ? "Опубликовано" : "Черновик"}
        </Badge>
      ),
    },
    {
      accessorKey: "showInFooter",
      header: "Футер",
      size: 80,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.showInFooter ? "Да" : "Нет"}
        </span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Дата",
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Действия",
      size: 150,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/cms-pages/${row.original.id}`)}
            title="Редактировать"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {row.original.isPublished && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/store/pages/${row.original.slug}`, "_blank")}
              title="Открыть на сайте"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(row.original.id)}
            disabled={deleting === row.original.id}
            title="Удалить"
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
        title="CMS-страницы"
        description="Управление статическими страницами магазина"
        actions={
          <Button onClick={() => router.push("/cms-pages/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Новая страница
          </Button>
        }
      />

      <DataGrid
        {...grid.gridProps}
        columns={columns}
        emptyMessage={grid.search ? "Страницы не найдены" : "Нет созданных страниц"}
        persistenceKey="cms-pages"
        toolbar={{
          ...grid.gridProps.toolbar,
          search: {
            value: grid.search,
            onChange: grid.setSearch,
            placeholder: "Поиск по заголовку...",
          },
        }}
      />
    </div>
  );
}

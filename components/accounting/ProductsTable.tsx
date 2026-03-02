"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ImageIcon, Link2, Globe, MoreHorizontal, Archive, ArchiveRestore, Copy, Trash2, Download, Upload, Crown, GitBranch, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import { ProductFiltersBar, toApiValue, type ProductFilters } from "./catalog/ProductFilters";
import { CSVImportWizard } from "./catalog/CSVImportWizard";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  unitId: string;
  categoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  publishedToStore: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  slug: string | null;
  unit: { id: string; shortName: string };
  category: { id: string; name: string } | null;
  purchasePrice: number | null;
  salePrice: number | null;
  discountedPrice: number | null;
  discountValidTo: string | null;
  discountName: string | null;
  variantCount: number;
  // Variant hierarchy
  masterProductId: string | null;
  masterProduct?: { id: string; name: string } | null;
  childVariantCount: number;
  isMainInGroup: boolean;
  variantGroupName: string | null;
}

interface Category { id: string; name: string; parentId: string | null; }

interface ProductsTableProps {
  onProductSelect?: (product: Product) => void;
  categoryId?: string | null;
}

const ALL = "__all__";

export function ProductsTable({ onProductSelect, categoryId }: ProductsTableProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const grid = useDataGrid<Product>({
    endpoint: "/api/accounting/products",
    pageSize: 50,
    sortable: true,
    defaultSort: { field: "name", order: "asc" },
    enableSearch: false,
    syncUrl: false,
    defaultFilters: {
      search: "",
      categoryId: categoryId || ALL,
      active: ALL,
      published: ALL,
      variantStatus: ALL,
      hasDiscount: "",
    },
    filterToParam: (key, value) => {
      if (key === "hasDiscount") return value === "true" ? "true" : null;
      if (key === "search") return value || null;
      return toApiValue(value) || null;
    },
  });

  // Sync categoryId prop
  useEffect(() => {
    if (categoryId !== undefined) {
      grid.setFilter("categoryId", categoryId || ALL);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Load reference data (categories needed for filter bar)
  useEffect(() => {
    fetch("/api/accounting/categories").then((r) => r.ok ? r.json() : []).then((c) => {
      setCategories(Array.isArray(c) ? c : []);
    });
  }, []);

  // Bridge between ProductFiltersBar and grid state
  const filtersForBar: ProductFilters = {
    search: grid.filters.search || "",
    categoryId: grid.filters.categoryId || ALL,
    active: grid.filters.active || ALL,
    published: grid.filters.published || ALL,
    variantStatus: grid.filters.variantStatus || ALL,
    hasDiscount: grid.filters.hasDiscount === "true",
    sortBy: grid.sort?.field || "name",
    sortOrder: grid.sort?.order || "asc",
  };

  const handleFiltersChange = (newFilters: ProductFilters) => {
    grid.setFilters({
      search: newFilters.search,
      categoryId: newFilters.categoryId,
      active: newFilters.active,
      published: newFilters.published,
      variantStatus: newFilters.variantStatus,
      hasDiscount: newFilters.hasDiscount ? "true" : "",
    });
    if (newFilters.sortBy !== grid.sort?.field || newFilters.sortOrder !== grid.sort?.order) {
      grid.setSort(newFilters.sortBy, newFilters.sortOrder as "asc" | "desc");
    }
  };

  const handleResetFilters = () => {
    grid.setFilters({
      search: "",
      categoryId: categoryId || ALL,
      active: ALL,
      published: ALL,
      variantStatus: ALL,
      hasDiscount: "",
    });
    grid.setSort("name", "asc");
  };

  const handleArchive = async (product: Product) => {
    try {
      const res = await fetch(`/api/accounting/products/${product.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка архивации");
      toast.success("Товар перемещён в архив");
      grid.mutate.refresh();
    } catch {
      toast.error("Ошибка архивации товара");
    }
  };

  const handleRestore = async (product: Product) => {
    try {
      const res = await fetch(`/api/accounting/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) throw new Error("Ошибка восстановления");
      toast.success("Товар восстановлен");
      grid.mutate.refresh();
    } catch {
      toast.error("Ошибка восстановления товара");
    }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const res = await fetch(`/api/accounting/products/${product.id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка дублирования");
      }
      const duplicated = await res.json();
      toast.success("Товар скопирован");
      router.push(`/products/${duplicated.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка дублирования товара");
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (grid.filters.search) params.set("search", grid.filters.search);
      const categoryVal = toApiValue(grid.filters.categoryId || ALL);
      const activeVal = toApiValue(grid.filters.active || ALL);
      const publishedVal = toApiValue(grid.filters.published || ALL);
      const variantStatusVal = toApiValue(grid.filters.variantStatus || ALL);
      if (categoryVal) params.set("categoryId", categoryVal);
      if (activeVal) params.set("active", activeVal);
      if (publishedVal) params.set("published", publishedVal);
      if (variantStatusVal) params.set("variantStatus", variantStatusVal);
      if (grid.filters.hasDiscount === "true") params.set("hasDiscount", "true");

      const res = await fetch(`/api/accounting/products/export?${params}`);
      if (!res.ok) throw new Error("Ошибка экспорта");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Экспорт завершён");
    } catch {
      toast.error("Ошибка экспорта товаров");
    }
  };

  // Bulk action handlers
  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch("/api/accounting/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", productIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Ошибка");
      toast.success(`${selectedIds.size} товар(ов) перемещено в архив`);
      setSelectedIds(new Set());
      grid.mutate.refresh();
    } catch {
      toast.error("Ошибка массовой архивации");
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch("/api/accounting/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", productIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Ошибка");
      toast.success(`${selectedIds.size} товар(ов) восстановлено`);
      setSelectedIds(new Set());
      grid.mutate.refresh();
    } catch {
      toast.error("Ошибка массового восстановления");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Удалить ${selectedIds.size} товар(ов) безвозвратно?`)) return;
    try {
      const res = await fetch("/api/accounting/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", productIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Ошибка");
      toast.success(`${selectedIds.size} товар(ов) удалено`);
      setSelectedIds(new Set());
      grid.mutate.refresh();
    } catch {
      toast.error("Ошибка массового удаления");
    }
  };

  const columns: DataGridColumn<Product>[] = [
    {
      id: "image",
      header: "Фото",
      size: 50,
      enableResizing: false,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.imageUrl ? (
          <img src={row.original.imageUrl} alt={row.original.name} className="h-8 w-8 rounded object-cover" />
        ) : (
          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        ),
    },
    {
      accessorKey: "name",
      header: "Название",
      size: 280,
      enableSorting: true,
      meta: { canHide: false },
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="font-medium">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className="text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                onClick={(e) => { e.stopPropagation(); router.push(`/products/${p.id}`); }}
              >
                {p.name}
              </button>
              {!p.isActive && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 text-muted-foreground">
                  Архив
                </Badge>
              )}
              {p.childVariantCount > 0 && (
                <Badge variant="default" className="text-[10px] px-1 py-0 shrink-0 bg-blue-500">
                  <Crown className="h-2.5 w-2.5 mr-0.5" />+{p.childVariantCount}
                </Badge>
              )}
              {p.masterProductId && p.masterProduct && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 text-muted-foreground">
                  <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                  {p.masterProduct.name.substring(0, 15)}{p.masterProduct.name.length > 15 ? "..." : ""}
                </Badge>
              )}
              {p.variantCount > 0 && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                  <Link2 className="h-2.5 w-2.5 mr-0.5" />{p.variantCount}
                </Badge>
              )}
              {p.publishedToStore && (
                <span title="На сайте"><Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" /></span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "sku",
      header: "Артикул",
      size: 120,
      enableSorting: true,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.sku || "—"}</span>,
    },
    {
      id: "category",
      header: "Категория",
      size: 150,
      cell: ({ row }) => row.original.category?.name || "—",
    },
    {
      id: "unit",
      header: "Ед.",
      size: 60,
      cell: ({ row }) => row.original.unit.shortName,
    },
    {
      accessorKey: "purchasePrice",
      header: "Закупка",
      size: 120,
      enableSorting: true,
      meta: { align: "right" as const },
      cell: ({ row }) => row.original.purchasePrice != null ? formatRub(row.original.purchasePrice) : "—",
    },
    {
      accessorKey: "salePrice",
      header: "Продажа",
      size: 120,
      enableSorting: true,
      meta: { align: "right" as const },
      cell: ({ row }) => row.original.salePrice != null ? formatRub(row.original.salePrice) : "—",
    },
    {
      id: "discountedPrice",
      header: "Со скидкой",
      size: 120,
      meta: { align: "right" as const },
      cell: ({ row }) =>
        row.original.discountedPrice != null ? (
          <span className="text-green-600 font-medium">{formatRub(row.original.discountedPrice)}</span>
        ) : "—",
    },
    {
      id: "discountValidTo",
      header: "Скидка до",
      size: 100,
      cell: ({ row }) => {
        const p = row.original;
        if (p.discountValidTo) {
          return <span className="text-xs text-muted-foreground">{new Date(p.discountValidTo).toLocaleDateString("ru")}</span>;
        }
        if (p.discountedPrice != null) {
          return <span className="text-xs text-muted-foreground">бессрочно</span>;
        }
        return "—";
      },
    },
    {
      id: "actions",
      size: 50,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/products/${row.original.id}`); }}>
              <ExternalLink className="h-4 w-4 mr-2" />Открыть карточку
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(row.original); }}>
              <Copy className="h-4 w-4 mr-2" />Дублировать
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.original.isActive ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(row.original); }}>
                <Archive className="h-4 w-4 mr-2" />В архив
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRestore(row.original); }}>
                <ArchiveRestore className="h-4 w-4 mr-2" />Восстановить
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <ProductFiltersBar
            filters={filtersForBar}
            categories={categories}
            onFiltersChange={handleFiltersChange}
            onReset={handleResetFilters}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" title="Экспорт в CSV" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" title="Импорт из CSV" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4" />
          </Button>
          <Button onClick={() => router.push("/products/new")}>Добавить товар</Button>
        </div>
      </div>

      <DataGrid
        data={grid.data}
        columns={columns}
        loading={grid.loading}
        emptyMessage={grid.filters.search ? "Ничего не найдено" : "Нет товаров"}
        persistenceKey="products-table"
        onRowClick={onProductSelect}
        getRowClassName={(p) =>
          `${onProductSelect ? "cursor-pointer" : ""} ${!p.isActive ? "opacity-50" : ""}`
        }
        selection={{
          enabled: true,
          selectedIds,
          onSelectionChange: setSelectedIds,
          getRowId: (row) => (row as Product).id,
        }}
        toolbar={{
          bulkActions: () => (
            <>
              <Button variant="outline" size="sm" onClick={handleBulkArchive}>
                <Archive className="h-4 w-4 mr-1" />В архив
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkRestore}>
                <ArchiveRestore className="h-4 w-4 mr-1" />Восстановить
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" />Удалить
              </Button>
            </>
          ),
        }}
        onSortingChange={(sortBy, sortOrder) => {
          grid.setSort(sortBy, sortOrder);
        }}
        sorting={grid.sort ? [{ id: grid.sort.field, desc: grid.sort.order === "desc" }] : undefined}
        pagination={grid.gridProps.pagination}
      />

      {/* CSV Import Wizard */}
      <CSVImportWizard
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={grid.mutate.refresh}
      />
    </div>
  );
}

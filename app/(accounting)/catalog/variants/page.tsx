"use client";

import { useEffect, useState } from "react";
import { Button, Tag, Select } from "antd";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { ImageIcon, Crown, ChevronRight, ChevronDown } from "lucide-react";
import { formatRub } from "@/lib/shared/utils";
import Link from "next/link";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

interface Category {
  id: string;
  name: string;
}

interface VariantInfo {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  publishedToStore: boolean;
  salePrice: number | null;
  stock: number;
}

interface VariantGroup {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  variantGroupName: string | null;
  category: Category | null;
  totalVariants: number;
  publishedVariants: number;
  priceRange: { min: number; max: number } | null;
  totalStock: number;
  variants: VariantInfo[];
}

// Flattened row type for DataGrid
type FlatRow =
  | { type: "group"; group: VariantGroup; expanded: boolean }
  | { type: "variant"; variant: VariantInfo; parentId: string };

const ALL_VALUE = "__all__";

export default function VariantGroupsPage() {
  const grid = useDataGrid<VariantGroup>({
    endpoint: "/api/accounting/variants/groups",
    pageSize: 20,
    enablePagination: true,
    enableSearch: true,
    defaultFilters: { categoryId: "" },
    filterToParam: (key, value) => (!value || value === ALL_VALUE) ? null : value,
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/accounting/categories")
      .then((r) => r.ok ? r.json() : [])
      .then((c) => setCategories(Array.isArray(c) ? c : []));
  }, []);

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Flatten groups + expanded variants into a single array
  const flatRows: FlatRow[] = [];
  for (const group of grid.data) {
    const expanded = expandedGroups.has(group.id);
    flatRows.push({ type: "group", group, expanded });
    if (expanded) {
      for (const variant of group.variants) {
        flatRows.push({ type: "variant", variant, parentId: group.id });
      }
    }
  }

  const columns: DataGridColumn<FlatRow>[] = [
    {
      id: "expand",
      size: 40,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => {
        if (row.original.type !== "group") return null;
        return row.original.expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        );
      },
    },
    {
      id: "image",
      header: "Фото",
      size: 50,
      enableResizing: false,
      cell: ({ row }) => {
        const r = row.original;
        const url = r.type === "group" ? r.group.imageUrl : r.variant.imageUrl;
        const sz = r.type === "group" ? "h-8 w-8" : "h-6 w-6";
        const iconSz = r.type === "group" ? "h-4 w-4" : "h-3 w-3";
        return url ? (
         // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={`${sz} rounded object-cover`} />
        ) : (
          <div className={`${sz} rounded bg-muted flex items-center justify-center`}>
            <ImageIcon className={`${iconSz} text-muted-foreground`} />
          </div>
        );
      },
    },
    {
      id: "name",
      header: "Мастер-товар",
      size: 280,
      meta: { canHide: false },
      cell: ({ row }) => {
        const r = row.original;
        if (r.type === "group") {
          return (
            <div className="flex items-center gap-2 font-medium">
              <Crown className="h-4 w-4 text-blue-500 shrink-0" />
              {r.group.name}
            </div>
          );
        }
        return (
          <span className="pl-6 text-sm">
            <span className="text-muted-foreground">&nbsp;└</span> {r.variant.name}
          </span>
        );
      },
    },
    {
      id: "sku",
      header: "Артикул",
      size: 120,
      cell: ({ row }) => {
        const r = row.original;
        const sku = r.type === "group" ? r.group.sku : r.variant.sku;
        return <span className="text-muted-foreground">{sku || "—"}</span>;
      },
    },
    {
      id: "category",
      header: "Категория",
      size: 150,
      cell: ({ row }) =>
        row.original.type === "group" ? (row.original.group.category?.name || "—") : "",
    },
    {
      id: "variants",
      header: "Вариантов",
      size: 130,
      meta: { align: "center" as const },
      cell: ({ row }) => {
        const r = row.original;
        if (r.type !== "group") {
          return r.variant.publishedToStore ? (
            <Tag color="green" className="text-xs">На сайте</Tag>
          ) : null;
        }
        return (
          <Tag color="default">
            {r.group.totalVariants}
            {r.group.publishedVariants > 0 && (
              <span className="text-green-600 ml-1">({r.group.publishedVariants} на сайте)</span>
            )}
          </Tag>
        );
      },
    },
    {
      id: "priceRange",
      header: "Диапазон цен",
      size: 200,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const r = row.original;
        if (r.type === "group") {
          return r.group.priceRange
            ? `${formatRub(r.group.priceRange.min)} — ${formatRub(r.group.priceRange.max)}`
            : "—";
        }
        return r.variant.salePrice != null ? formatRub(r.variant.salePrice) : "—";
      },
    },
    {
      id: "stock",
      header: "Остаток",
      size: 100,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const r = row.original;
        const stock = r.type === "group" ? r.group.totalStock : r.variant.stock;
        return stock > 0 ? String(stock) : "—";
      },
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Группы вариантов</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление мастер-товарами и их вариантами
          </p>
        </div>
        <Link href="/catalog">
          <Button variant="outlined">&#8592; Назад в каталог</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Всего групп: {grid.total}</span>
        <span>&bull;</span>
        <span>
          Всего вариантов: {grid.data.reduce((sum, g) => sum + g.totalVariants, 0)}
        </span>
      </div>

      <DataGrid
        data={flatRows}
        columns={columns}
        loading={grid.loading}
        emptyMessage="Группы вариантов не найдены"
        persistenceKey="variant-groups"
        onRowClick={(row) => {
          if (row.type === "group") toggleExpanded(row.group.id);
        }}
        getRowClassName={(row) =>
          `cursor-pointer ${row.type === "variant" ? "bg-muted/30" : ""}`
        }
        toolbar={{
          ...grid.gridProps.toolbar,
          search: {
            value: grid.search,
            onChange: grid.setSearch,
            placeholder: "Поиск по названию, артикулу...",
          },
          filters: (
            <Select
              value={grid.filters.categoryId || ALL_VALUE}
              onChange={(v: string) => grid.setFilter("categoryId", v === ALL_VALUE ? "" : v)}
              placeholder="Все категории"
              style={{ width: 180 }}
              options={[
                { value: ALL_VALUE, label: "Все категории" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          ),
        }}
        pagination={grid.gridProps.pagination}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button, Input, Table, Tag, Select, type TableColumnsType } from "antd";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
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

  const groupColumns: TableColumnsType<VariantGroup> = [
    {
      key: "expand",
      width: 40,
      render: (_, group) =>
        expandedGroups.has(group.id) ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ),
    },
    {
      key: "image",
      title: "Фото",
      width: 50,
      render: (_, group) =>
        group.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
        ) : (
          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        ),
    },
    {
      key: "name",
      title: "Мастер-товар",
      width: 280,
      render: (_, group) => (
        <div className="flex items-center gap-2 font-medium">
          <Crown className="h-4 w-4 text-blue-500 shrink-0" />
          {group.name}
        </div>
      ),
    },
    {
      key: "sku",
      title: "Артикул",
      width: 120,
      render: (_, group) => (
        <span className="text-muted-foreground">{group.sku || "—"}</span>
      ),
    },
    {
      key: "category",
      title: "Категория",
      width: 150,
      render: (_, group) => group.category?.name || "—",
    },
    {
      key: "variants",
      title: "Вариантов",
      width: 130,
      align: "center",
      render: (_, group) => (
        <Tag color="default">
          {group.totalVariants}
          {group.publishedVariants > 0 && (
            <span className="text-green-600 ml-1">({group.publishedVariants} на сайте)</span>
          )}
        </Tag>
      ),
    },
    {
      key: "priceRange",
      title: "Диапазон цен",
      width: 200,
      align: "right",
      render: (_, group) =>
        group.priceRange
          ? `${formatRub(group.priceRange.min)} — ${formatRub(group.priceRange.max)}`
          : "—",
    },
    {
      key: "stock",
      title: "Остаток",
      width: 100,
      align: "right",
      render: (_, group) => (group.totalStock > 0 ? String(group.totalStock) : "—"),
    },
  ];

  const variantColumns: TableColumnsType<VariantInfo> = [
    {
      key: "image",
      width: 50,
      render: (_, variant) =>
        variant.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={variant.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />
        ) : (
          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        ),
    },
    {
      key: "name",
      title: "Вариант",
      width: 280,
      render: (_, variant) => (
        <span className="pl-6 text-sm">
          <span className="text-muted-foreground">&nbsp;└</span> {variant.name}
        </span>
      ),
    },
    {
      key: "sku",
      title: "Артикул",
      width: 120,
      render: (_, variant) => (
        <span className="text-muted-foreground">{variant.sku || "—"}</span>
      ),
    },
    {
      key: "published",
      title: "Вариантов",
      width: 130,
      align: "center",
      render: (_, variant) =>
        variant.publishedToStore ? (
          <Tag color="green" className="text-xs">На сайте</Tag>
        ) : null,
    },
    {
      key: "priceRange",
      title: "Диапазон цен",
      width: 200,
      align: "right",
      render: (_, variant) =>
        variant.salePrice != null ? formatRub(variant.salePrice) : "—",
    },
    {
      key: "stock",
      title: "Остаток",
      width: 100,
      align: "right",
      render: (_, variant) => (variant.stock > 0 ? String(variant.stock) : "—"),
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

      <ERPToolbar
        extraActions={
          <>
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
            <Input.Search
              placeholder="Поиск по названию, артикулу..."
              value={grid.search}
              onChange={(e) => grid.setSearch(e.target.value)}
              style={{ width: 250 }}
            />
          </>
        }
      />

      <Table<VariantGroup>
        dataSource={grid.data}
        columns={groupColumns}
        loading={grid.loading}
        rowKey="id"
        pagination={{
          current: grid.page,
          pageSize: grid.pageSize,
          total: grid.total,
          showSizeChanger: true,
          onChange: (page, pageSize) => {
            grid.setPage(page);
            grid.setPageSize(pageSize ?? 20);
          },
        }}
        expandable={{
          expandedRowKeys: Array.from(expandedGroups),
          onExpand: (_, group) => toggleExpanded(group.id),
          expandedRowRender: (group) => (
            <Table<VariantInfo>
              dataSource={group.variants}
              columns={variantColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          ),
          showExpandColumn: false,
        }}
        onRow={(group) => ({
          onClick: () => toggleExpanded(group.id),
          style: { cursor: "pointer" },
        })}
      />
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Tag, Tooltip, Badge, Space, Dropdown } from "antd";
import { MoreOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatMoney } from "@/components/erp/columns";
import {
  ProductFiltersBar,
  defaultFilters,
  toApiValue,
  type ProductFilters,
} from "./ProductFilters";
import { ProductEditDialog } from "./ProductEditDialog";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Unit {
  id: string;
  name: string;
  shortName: string;
}

export interface CatalogProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  publishedToStore: boolean;
  unitId: string;
  categoryId: string | null;
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
  childVariantCount: number;
  masterProduct: { id: string; name: string } | null;
}

interface ProductsTableProps {
  categoryId: string | null;
  flatCategories: Category[];
  onProductCreated?: () => void;
}

// ─── Column definitions ───────────────────────────────────────────────────────

function getColumns(
  onEdit: (row: CatalogProductRow) => void,
  onDelete: (row: CatalogProductRow) => void
): ERPColumn<CatalogProductRow>[] {
  return [
    {
      key: "image",
      title: "",
      width: 56,
      render: (_v, row) =>
        row.imageUrl ? (
          <Image
            src={row.imageUrl}
            alt={row.name}
            width={40}
            height={40}
            className="rounded object-cover"
            style={{ width: 40, height: 40 }}
          />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
            —
          </div>
        ),
    },
    {
      key: "name",
      title: "Наименование",
      dataIndex: "name",
      sortable: true,
      ellipsis: true,
      render: (_v, row) => (
        <Space orientation="vertical" size={0}>
          <Link
            href={`/products/${row.id}`}
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name}
          </Link>
          {row.sku && (
            <span className="text-xs text-gray-400">SKU: {row.sku}</span>
          )}
          {row.masterProduct && (
            <span className="text-xs text-gray-400">
              Вариант: {row.masterProduct.name}
            </span>
          )}
        </Space>
      ),
    },
    {
      key: "category",
      title: "Категория",
      width: 160,
      ellipsis: true,
      render: (_v, row) =>
        row.category ? (
          <span className="text-sm text-gray-600">{row.category.name}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "unit",
      title: "Ед.",
      width: 70,
      render: (_v, row) => (
        <span className="text-sm text-gray-500">{row.unit.shortName}</span>
      ),
    },
    {
      key: "purchasePrice",
      title: "Закупка",
      width: 110,
      align: "right",
      render: (_v, row) => (
        <span className="text-sm font-mono">{formatMoney(row.purchasePrice)}</span>
      ),
    },
    {
      key: "salePrice",
      title: "Продажа",
      width: 120,
      align: "right",
      render: (_v, row) => {
        if (row.discountedPrice !== null && row.salePrice !== null) {
          return (
            <Space orientation="vertical" size={0} style={{ textAlign: "right" }}>
              <Tooltip
                title={
                  row.discountName
                    ? `Скидка: ${row.discountName}${row.discountValidTo ? ` до ${new Date(row.discountValidTo).toLocaleDateString("ru-RU")}` : ""}`
                    : "Скидка"
                }
              >
                <span className="text-xs line-through text-gray-400 font-mono">
                  {formatMoney(row.salePrice)}
                </span>
              </Tooltip>
              <span className="text-sm font-mono text-green-600">
                {formatMoney(row.discountedPrice)}
              </span>
            </Space>
          );
        }
        return (
          <span className="text-sm font-mono">{formatMoney(row.salePrice)}</span>
        );
      },
    },
    {
      key: "variants",
      title: "Варианты",
      width: 100,
      align: "center",
      render: (_v, row) => {
        const count = row.variantCount + row.childVariantCount;
        return count === 0 ? (
          <span className="text-gray-300 text-sm">—</span>
        ) : (
          <Badge
            count={count}
            style={{ backgroundColor: "#52c41a" }}
            overflowCount={99}
          />
        );
      },
    },
    {
      key: "status",
      title: "Статус",
      width: 130,
      render: (_v, row) => (
        <Space size={4} wrap>
          <Tag color={row.isActive ? "success" : "default"} variant="filled">
            {row.isActive ? "Активен" : "В архиве"}
          </Tag>
          {row.publishedToStore && (
            <Tag color="blue" variant="filled">
              На сайте
            </Tag>
          )}
        </Space>
      ),
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductsTable({
  categoryId,
  flatCategories,
  onProductCreated,
}: ProductsTableProps) {
  const router = useRouter();

  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<string | null>(null);

  // Filters — sync categoryId from prop into filters
  const [filters, setFilters] = useState<ProductFilters>({
    ...defaultFilters,
    categoryId: categoryId ?? "__all__",
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProductRow | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);

  // Sync external categoryId prop → filters
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      categoryId: categoryId ?? "__all__",
    }));
    setPage(1);
  }, [categoryId]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (toApiValue(filters.search)) params.set("search", filters.search);
      if (toApiValue(filters.categoryId)) params.set("categoryId", toApiValue(filters.categoryId));
      if (toApiValue(filters.active)) params.set("active", toApiValue(filters.active));
      if (toApiValue(filters.published)) params.set("published", toApiValue(filters.published));
      if (filters.hasDiscount) params.set("hasDiscount", "true");
      if (toApiValue(filters.variantStatus)) params.set("variantStatus", toApiValue(filters.variantStatus));
      if (sortField) params.set("sortBy", sortField);
      if (sortOrder) params.set("sortOrder", sortOrder === "ascend" ? "asc" : "desc");
      params.set("page", String(page));
      params.set("limit", String(pageSize));

      const res = await fetch(`/api/accounting/products?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setProducts(Array.isArray(json.data) ? json.data : []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sortField, sortOrder]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Load units for the create/edit dialog
  const loadUnits = useCallback(async () => {
    if (units.length > 0) return;
    try {
      const res = await fetch("/api/accounting/units");
      if (res.ok) setUnits(await res.json());
    } catch { /* ignore */ }
  }, [units.length]);

  const handleFiltersChange = (newFilters: ProductFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters({ ...defaultFilters, categoryId: categoryId ?? "__all__" });
    setPage(1);
  };

  const handleEdit = (row: CatalogProductRow) => {
    loadUnits();
    setEditingProduct(row);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    loadUnits();
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleDelete = async (row: CatalogProductRow) => {
    if (!confirm(`Удалить товар "${row.name}"?`)) return;
    try {
      const res = await csrfFetch(`/api/accounting/products/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Ошибка удаления");
        return;
      }
      toast.success("Товар удалён");
      loadProducts();
      onProductCreated?.();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const handleSaved = () => {
    loadProducts();
    onProductCreated?.();
  };

  const columns = getColumns(handleEdit, handleDelete);

  const rowActions = (row: CatalogProductRow) => (
    <Dropdown
      menu={{
        items: [
          {
            key: "edit",
            label: "Редактировать",
            icon: <EditOutlined />,
            onClick: () => handleEdit(row),
          },
          {
            key: "open",
            label: "Открыть страницу",
            onClick: () => router.push(`/products/${row.id}`),
          },
          { type: "divider" },
          {
            key: "delete",
            label: "Удалить",
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(row),
          },
        ],
      }}
      trigger={["click"]}
    >
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
        <MoreOutlined />
      </Button>
    </Dropdown>
  );

  return (
    <div className="space-y-3">
      <ERPToolbar
        onCreateClick={handleCreate}
        createLabel="Новый товар"
      />

      <ProductFiltersBar
        filters={filters}
        categories={flatCategories}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      <ERPTable<CatalogProductRow>
        data={products}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{ current: page, pageSize, total }}
        rowActions={rowActions}
        onRowClick={(row) => router.push(`/products/${row.id}`)}
        onChange={({ page: p, pageSize: ps, sortField: sf, sortOrder: so }) => {
          if (p !== undefined) setPage(p);
          if (ps !== undefined) setPageSize(ps);
          setSortField(sf);
          setSortOrder(so ?? null);
        }}
        emptyText="Нет товаров"
        size="small"
        sticky
      />

      <ProductEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProduct={editingProduct}
        units={units}
        categories={flatCategories}
        onSaved={handleSaved}
      />
    </div>
  );
}

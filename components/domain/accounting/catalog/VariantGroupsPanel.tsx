"use client";

import { useEffect, useState, useCallback } from "react";
import { Tag, Table, type TableColumnsType, Select, Input, Button } from "antd";
import { Search, ImageIcon, Crown, ChevronRight, ChevronDown } from "lucide-react";
import { formatRub } from "@/lib/shared/utils";

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

export function VariantGroupsPanel() {
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_VALUE);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (categoryId !== ALL_VALUE) params.set("categoryId", categoryId);

      const res = await fetch(`/api/accounting/variants/groups?${params}`);
      if (!res.ok) { setGroups([]); setTotal(0); return; }
      const data = await res.json();
      setGroups(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setGroups([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    fetch("/api/accounting/categories")
      .then((r) => r.ok ? r.json() : [])
      .then((c) => setCategories(Array.isArray(c) ? c : []));
  }, []);

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / 20);

  const columns: TableColumnsType<VariantGroup> = [
    {
      key: "expand",
      width: 40,
      render: (_, group) => (
        expandedGroups.has(group.id) ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )
      ),
    },
    {
      key: "image",
      width: 48,
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
      render: (_, group) => (
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="font-medium">{group.name}</span>
        </div>
      ),
    },
    {
      key: "sku",
      title: "Артикул",
      render: (_, group) => <span className="text-muted-foreground">{group.sku || "—"}</span>,
    },
    {
      key: "category",
      title: "Категория",
      render: (_, group) => group.category?.name || "—",
    },
    {
      key: "variants",
      title: "Вариантов",
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
      align: "right",
      render: (_, group) =>
        group.priceRange ? (
          <span>
            {formatRub(group.priceRange.min)} — {formatRub(group.priceRange.max)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "stock",
      title: "Остаток",
      align: "right",
      render: (_, group) => (group.totalStock > 0 ? group.totalStock : "—"),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, артикулу..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>

        <Select
          value={categoryId}
          onChange={(v) => { setCategoryId(v); setPage(1); }}
          placeholder="Все категории"
          style={{ width: 180 }}
          options={[
            { value: ALL_VALUE, label: "Все категории" },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Всего групп: {total}</span>
        {groups.length > 0 && (
          <>
            <span>|</span>
            <span>
              Всего вариантов: {groups.reduce((sum, g) => sum + g.totalVariants, 0)}
            </span>
          </>
        )}
      </div>

      {/* Info message if no groups */}
      {!loading && groups.length === 0 && (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <Crown className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium mb-2">Нет групп вариантов</p>
          <p className="text-sm">
            Чтобы создать группу вариантов, откройте товар и во вкладке &quot;Подсказки вариантов&quot; 
            примите предложенные связи, или свяжите товары вручную во вкладке &quot;Модификации&quot;.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || groups.length > 0) && (
        <div className="border rounded-lg">
          <Table
            columns={columns}
            dataSource={groups}
            rowKey="id"
            pagination={false}
            loading={loading}
            expandable={{
              expandedRowKeys: Array.from(expandedGroups),
              onExpand: (_, record) => toggleExpanded(record.id),
              expandedRowRender: (group) => (
                <div className="bg-muted/30">
                  {group.variants.map((variant) => (
                    <div key={variant.id} className="flex items-center py-2 px-4 border-b border-muted last:border-0">
                      <div className="w-10"></div>
                      <div className="w-12">
                        {variant.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={variant.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />
                        ) : (
                          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pl-4 text-sm">
                        <span className="text-muted-foreground">└</span> {variant.name}
                      </div>
                      <div className="w-32 text-muted-foreground text-sm">{variant.sku || "—"}</div>
                      <div className="w-32"></div>
                      <div className="w-32 text-center">
                        {variant.publishedToStore && (
                          <Tag color="green" className="text-xs">
                            На сайте
                          </Tag>
                        )}
                      </div>
                      <div className="w-32 text-right text-sm">
                        {variant.salePrice != null ? formatRub(variant.salePrice) : "—"}
                      </div>
                      <div className="w-24 text-right text-sm">
                        {variant.stock > 0 ? variant.stock : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            }}
          />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outlined"
            size="small"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {page} из {totalPages}
          </span>
          <Button
            variant="outlined"
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперед
          </Button>
        </div>
      )}
    </div>
  );
}

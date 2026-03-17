"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-12">Фото</TableHead>
                <TableHead>Мастер-товар</TableHead>
                <TableHead>Артикул</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead className="text-center">Вариантов</TableHead>
                <TableHead className="text-right">Диапазон цен</TableHead>
                <TableHead className="text-right">Остаток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <>
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpanded(group.id)}
                    >
                      <TableCell>
                        {expandedGroups.has(group.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        {group.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={group.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-blue-500 shrink-0" />
                          {group.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {group.sku || "—"}
                      </TableCell>
                      <TableCell>{group.category?.name || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {group.totalVariants}
                          {group.publishedVariants > 0 && (
                            <span className="text-green-600 ml-1">
                              ({group.publishedVariants} на сайте)
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {group.priceRange ? (
                          <span>
                            {formatRub(group.priceRange.min)} — {formatRub(group.priceRange.max)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {group.totalStock > 0 ? group.totalStock : "—"}
                      </TableCell>
                    </TableRow>

                    {/* Expanded variants */}
                    {expandedGroups.has(group.id) && group.variants.map((variant) => (
                      <TableRow key={variant.id} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell>
                          {variant.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={variant.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="pl-8 text-sm">
                          <span className="text-muted-foreground">└</span> {variant.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {variant.sku || "—"}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-center">
                          {variant.publishedToStore && (
                            <Badge variant="outline" className="text-xs text-green-600">
                              На сайте
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {variant.salePrice != null ? formatRub(variant.salePrice) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {variant.stock > 0 ? variant.stock : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {page} из {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
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

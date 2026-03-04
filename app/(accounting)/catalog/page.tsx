"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Plus, ChevronRight, ChevronDown, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import { ProductsTable } from "@/components/accounting";
import { PriceListsPanel } from "@/components/accounting/catalog/PriceListsPanel";
import { PriceListDetail } from "@/components/accounting/catalog/PriceListDetail";
import { VariantGroupsPanel } from "@/components/accounting/catalog/VariantGroupsPanel";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  isActive: boolean;
  children?: Category[];
  productCount?: number;
}

function buildTree(categories: Category[]): Category[] {
  const map = new Map<string, Category>();
  const roots: Category[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

interface TreeNodeProps {
  category: Category;
  level: number;
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}

function TreeNode({ category, level, selectedId, expanded, onSelect, onToggle, onEdit, onDelete }: TreeNodeProps) {
  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = expanded.has(category.id);
  const isSelected = selectedId === category.id;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer text-sm group",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(category.id)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggle(category.id); }}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        {isExpanded ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
        <span className="truncate flex-1">{category.name}</span>
        {category.productCount != null && category.productCount > 0 && (
          <span className={cn("text-xs", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {category.productCount}
          </span>
        )}
        <div className={cn("hidden gap-0.5 shrink-0", !isSelected && "group-hover:flex")}>
          <button
            className="p-0.5 rounded hover:bg-accent-foreground/10"
            onClick={(e) => { e.stopPropagation(); onEdit(category); }}
            title="Редактировать"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-destructive/20"
            onClick={(e) => { e.stopPropagation(); onDelete(category); }}
            title="Удалить"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {category.children!.map((child) => (
            <TreeNode
              key={child.id}
              category={child}
              level={level + 1}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [flatCategories, setFlatCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);

  // Main tabs state
  const [activeTab, setActiveTab] = useState("products");
  
  // Price lists state
  const [selectedPriceList, setSelectedPriceList] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);

  // Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: "", parentId: "" });
  const [savingCategory, setSavingCategory] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        fetch("/api/accounting/categories"),
        fetch("/api/accounting/products?limit=1"),
      ]);
      if (!catRes.ok || !prodRes.ok) {
        setFlatCategories([]);
        setCategories([]);
        return;
      }
      const cats: Category[] = await catRes.json();
      const prodData = await prodRes.json();
      if (!Array.isArray(cats)) {
        setFlatCategories([]);
        setCategories([]);
        return;
      }
      setTotalProducts(prodData.total || 0);
      setFlatCategories(cats);

      // Count products per category
      const countPromises = cats.map(async (cat) => {
        const res = await fetch(`/api/accounting/products?categoryId=${cat.id}&limit=1`);
        const data = await res.json();
        return { id: cat.id, count: data.total || 0 };
      });

      const counts = await Promise.all(countPromises);
      const countMap = new Map(counts.map((c) => [c.id, c.count]));

      const withCounts = cats.map((c) => ({ ...c, productCount: countMap.get(c.id) || 0 }));
      const tree = buildTree(withCounts);
      setCategories(tree);

      // Auto-expand root categories
      setExpanded(new Set(withCounts.filter((c) => !c.parentId).map((c) => c.id)));
    } catch {
      toast.error("Ошибка загрузки категорий");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: string | null) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id));
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCatForm({ name: "", parentId: selectedCategoryId || "" });
    setCatDialogOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCatForm({ name: cat.name, parentId: cat.parentId || "" });
    setCatDialogOpen(true);
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!confirm(`Удалить категорию "${cat.name}"?`)) return;
    try {
      const res = await fetch(`/api/accounting/categories/${cat.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Категория удалена");
      if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
      loadCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const saveCategory = async () => {
    if (!catForm.name) {
      toast.error("Название обязательно");
      return;
    }
    setSavingCategory(true);
    try {
      const body = { name: catForm.name, parentId: catForm.parentId || null };
      const res = editingCategory
        ? await fetch(`/api/accounting/categories/${editingCategory.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/accounting/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingCategory ? "Категория обновлена" : "Категория создана");
      setCatDialogOpen(false);
      loadCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingCategory(false);
    }
  };

  const selectedCategoryName = selectedCategoryId
    ? flatCategories.find((c) => c.id === selectedCategoryId)?.name || "Категория"
    : "Все товары";

  return (
    <div className="space-y-6">
      <PageHeader title="Каталог" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="products">Товары</TabsTrigger>
          <TabsTrigger value="variants">Группы вариантов</TabsTrigger>
          <TabsTrigger value="pricelists">Прайс-листы</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <div className="flex gap-6">
            {/* Left: Category Tree */}
            <div className="w-64 shrink-0">
              <div className="border rounded-lg">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="text-sm font-medium">Категории</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openCreateCategory} title="Добавить категорию">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="py-1 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {/* All Products */}
                  <div
                    className={cn(
                      "flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer text-sm mx-1",
                      selectedCategoryId === null
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                    onClick={() => setSelectedCategoryId(null)}
                  >
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Все товары</span>
                    <span className={cn("text-xs", selectedCategoryId === null ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {totalProducts}
                    </span>
                  </div>

                  {loading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Загрузка...</div>
                  ) : categories.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Нет категорий</div>
                  ) : (
                    <div className="mx-1">
                      {categories.map((cat) => (
                        <TreeNode
                          key={cat.id}
                          category={cat}
                          level={0}
                          selectedId={selectedCategoryId}
                          expanded={expanded}
                          onSelect={handleSelect}
                          onToggle={handleToggle}
                          onEdit={openEditCategory}
                          onDelete={handleDeleteCategory}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Products */}
            <div className="flex-1 min-w-0">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{selectedCategoryName}</h2>
              </div>
              <ProductsTable
                key={selectedCategoryId || "all"}
                categoryId={selectedCategoryId}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="variants" className="mt-6">
          <VariantGroupsPanel />
        </TabsContent>

        <TabsContent value="pricelists" className="mt-6">
          {selectedPriceList ? (
            <PriceListDetail
              priceList={selectedPriceList}
              onBack={() => setSelectedPriceList(null)}
            />
          ) : (
            <PriceListsPanel
              onSelectPriceList={setSelectedPriceList}
              selectedPriceListId={null}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Редактировать категорию" : "Новая категория"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Родительская категория</Label>
              <Select value={catForm.parentId} onValueChange={(v) => setCatForm({ ...catForm, parentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Без родительской" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без родительской</SelectItem>
                  {flatCategories
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveCategory} disabled={savingCategory}>
              {savingCategory ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

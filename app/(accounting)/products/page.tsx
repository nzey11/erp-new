"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
import { ProductsTable } from "@/components/accounting";

interface Unit {
  id: string;
  name: string;
  shortName: string;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

export default function ProductsPage() {
  // Units state
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({ name: "", shortName: "" });
  const [savingUnit, setSavingUnit] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", parentId: "" });
  const [savingCategory, setSavingCategory] = useState(false);

  const loadRefs = useCallback(async () => {
    try {
      const [unitsRes, categoriesRes] = await Promise.all([
        fetch("/api/accounting/units"),
        fetch("/api/accounting/categories"),
      ]);
      setUnits(await unitsRes.json());
      setCategories(await categoriesRes.json());
    } catch {
      toast.error("Ошибка загрузки справочников");
    }
  }, []);

  useEffect(() => { loadRefs(); }, [loadRefs]);

  // Unit handlers
  const openCreateUnit = () => {
    setEditingUnit(null);
    setUnitForm({ name: "", shortName: "" });
    setUnitDialogOpen(true);
  };

  const openEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({ name: unit.name, shortName: unit.shortName });
    setUnitDialogOpen(true);
  };

  const saveUnit = async () => {
    if (!unitForm.name || !unitForm.shortName) {
      toast.error("Название и сокращение обязательны");
      return;
    }
    setSavingUnit(true);
    try {
      const res = editingUnit
        ? await csrfFetch(`/api/accounting/units/${editingUnit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) })
        : await csrfFetch("/api/accounting/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingUnit ? "Единица обновлена" : "Единица создана");
      setUnitDialogOpen(false);
      loadRefs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingUnit(false);
    }
  };

  // Category handlers
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", parentId: "" });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, parentId: cat.parentId || "" });
    setCategoryDialogOpen(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.name) {
      toast.error("Название обязательно");
      return;
    }
    setSavingCategory(true);
    try {
      const body = { name: categoryForm.name, parentId: categoryForm.parentId || null };
      const res = editingCategory
        ? await csrfFetch(`/api/accounting/categories/${editingCategory.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await csrfFetch("/api/accounting/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingCategory ? "Категория обновлена" : "Категория создана");
      setCategoryDialogOpen(false);
      loadRefs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Товары" />

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Каталог</TabsTrigger>
          <TabsTrigger value="categories">Категории</TabsTrigger>
          <TabsTrigger value="units">Единицы измерения</TabsTrigger>
        </TabsList>

        {/* Catalog Tab */}
        <TabsContent value="catalog">
          <ProductsTable />
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Категории товаров ({categories.length})</CardTitle>
              <Button size="sm" onClick={openCreateCategory}>
                <Plus className="h-4 w-4 mr-2" />Добавить
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Родительская</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Нет категорий</TableCell>
                    </TableRow>
                  ) : (
                    categories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {cat.parentId ? categories.find((c) => c.id === cat.parentId)?.name || "—" : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEditCategory(cat)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Units Tab */}
        <TabsContent value="units">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Единицы измерения ({units.length})</CardTitle>
              <Button size="sm" onClick={openCreateUnit}>
                <Plus className="h-4 w-4 mr-2" />Добавить
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Сокращение</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Нет единиц измерения</TableCell>
                    </TableRow>
                  ) : (
                    units.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{unit.name}</TableCell>
                        <TableCell>{unit.shortName}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEditUnit(unit)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Unit Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Редактировать единицу" : "Новая единица измерения"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Килограмм" />
            </div>
            <div className="grid gap-2">
              <Label>Сокращение *</Label>
              <Input value={unitForm.shortName} onChange={(e) => setUnitForm({ ...unitForm, shortName: e.target.value })} placeholder="кг" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveUnit} disabled={savingUnit}>{savingUnit ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Редактировать категорию" : "Новая категория"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Родительская категория</Label>
              <Select value={categoryForm.parentId} onValueChange={(v) => setCategoryForm({ ...categoryForm, parentId: v })}>
                <SelectTrigger><SelectValue placeholder="Без родительской" /></SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.id !== editingCategory?.id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveCategory} disabled={savingCategory}>{savingCategory ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

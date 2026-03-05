"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";


// ============== Types ==============

interface Unit {
  id: string;
  name: string;
  shortName: string;
  isActive: boolean;
}

interface PriceList {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { prices: number };
}

interface CustomFieldDef {
  id: string;
  name: string;
  fieldType: string;
  options: string | null;
  isActive: boolean;
  order: number;
}

export default function ReferencesPage() {
  // Units
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({ name: "", shortName: "" });
  const [savingUnit, setSavingUnit] = useState(false);

  // Price Lists
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [plDialogOpen, setPlDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<PriceList | null>(null);
  const [plForm, setPlForm] = useState({ name: "", description: "" });
  const [savingPriceList, setSavingPriceList] = useState(false);

  // Custom Field Definitions
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [cfDialogOpen, setCfDialogOpen] = useState(false);
  const [editingCf, setEditingCf] = useState<CustomFieldDef | null>(null);
  const [cfForm, setCfForm] = useState({ name: "", fieldType: "text", options: "" });
  const [savingCf, setSavingCf] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [unitsRes, plRes, cfRes] = await Promise.all([
        fetch("/api/accounting/units"),
        fetch("/api/accounting/price-lists"),
        fetch("/api/accounting/custom-fields"),
      ]);
      const unitsData = unitsRes.ok ? await unitsRes.json() : [];
      const plData = plRes.ok ? await plRes.json() : [];
      const cfData = cfRes.ok ? await cfRes.json() : [];
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setPriceLists(Array.isArray(plData) ? plData : []);
      setCustomFields(Array.isArray(cfData) ? cfData : []);
    } catch {
      toast.error("Ошибка загрузки справочников");
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ============== Units ==============
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
        ? await fetch(`/api/accounting/units/${editingUnit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) })
        : await fetch("/api/accounting/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingUnit ? "Единица обновлена" : "Единица создана");
      setUnitDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingUnit(false);
    }
  };

  // ============== Price Lists ==============
  const openCreatePriceList = () => {
    setEditingPriceList(null);
    setPlForm({ name: "", description: "" });
    setPlDialogOpen(true);
  };

  const openEditPriceList = (pl: PriceList) => {
    setEditingPriceList(pl);
    setPlForm({ name: pl.name, description: pl.description || "" });
    setPlDialogOpen(true);
  };

  const savePriceList = async () => {
    if (!plForm.name) {
      toast.error("Название обязательно");
      return;
    }
    setSavingPriceList(true);
    try {
      const body = { name: plForm.name, description: plForm.description || null };
      const res = editingPriceList
        ? await fetch(`/api/accounting/price-lists/${editingPriceList.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/accounting/price-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingPriceList ? "Прайс-лист обновлён" : "Прайс-лист создан");
      setPlDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingPriceList(false);
    }
  };

  // ============== Custom Fields ==============
  const openCreateCf = () => {
    setEditingCf(null);
    setCfForm({ name: "", fieldType: "text", options: "" });
    setCfDialogOpen(true);
  };

  const openEditCf = (cf: CustomFieldDef) => {
    setEditingCf(cf);
    setCfForm({
      name: cf.name,
      fieldType: cf.fieldType,
      options: cf.fieldType === "select" && cf.options ? (JSON.parse(cf.options) as string[]).join(", ") : "",
    });
    setCfDialogOpen(true);
  };

  const saveCf = async () => {
    if (!cfForm.name) {
      toast.error("Название обязательно");
      return;
    }
    setSavingCf(true);
    try {
      const body: Record<string, unknown> = { name: cfForm.name, fieldType: cfForm.fieldType };
      if (cfForm.fieldType === "select" && cfForm.options) {
        body.options = cfForm.options.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const res = editingCf
        ? await fetch(`/api/accounting/custom-fields/${editingCf.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/accounting/custom-fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingCf ? "Характеристика обновлена" : "Характеристика создана");
      setCfDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingCf(false);
    }
  };

  const deleteCf = async (id: string) => {
    try {
      const res = await fetch(`/api/accounting/custom-fields/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка");
      toast.success("Характеристика удалена");
      loadAll();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Текст",
    number: "Число",
    select: "Список",
    boolean: "Да/Нет",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Справочники" />

      <Tabs defaultValue="units">
        <TabsList>
          <TabsTrigger value="units">Единицы измерения</TabsTrigger>
          <TabsTrigger value="pricelists">Прайс-листы</TabsTrigger>
          <TabsTrigger value="customfields">Характеристики</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2 ml-auto">
          <Link href="/warehouses">
            <Button variant="outline" size="sm" className="gap-1">
              Склады
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* ============== Units Tab ============== */}
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

        {/* ============== Price Lists Tab ============== */}
        <TabsContent value="pricelists">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Прайс-листы ({priceLists.length})</CardTitle>
              <Button size="sm" onClick={openCreatePriceList}>
                <Plus className="h-4 w-4 mr-2" />Добавить
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead className="text-right">Кол-во цен</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceLists.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Нет прайс-листов</TableCell>
                    </TableRow>
                  ) : (
                    priceLists.map((pl) => (
                      <TableRow key={pl.id}>
                        <TableCell className="font-medium">{pl.name}</TableCell>
                        <TableCell className="text-muted-foreground">{pl.description || "—"}</TableCell>
                        <TableCell className="text-right">{pl._count?.prices ?? 0}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEditPriceList(pl)}>
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

        {/* ============== Custom Fields Tab ============== */}
        <TabsContent value="customfields">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Характеристики товаров ({customFields.length})</CardTitle>
              <Button size="sm" onClick={openCreateCf}>
                <Plus className="h-4 w-4 mr-2" />Добавить
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Опции</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Нет характеристик</TableCell>
                    </TableRow>
                  ) : (
                    customFields.map((cf) => (
                      <TableRow key={cf.id}>
                        <TableCell className="font-medium">{cf.name}</TableCell>
                        <TableCell>{FIELD_TYPE_LABELS[cf.fieldType] || cf.fieldType}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {cf.fieldType === "select" && cf.options
                            ? (JSON.parse(cf.options) as string[]).join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditCf(cf)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteCf(cf.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
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

      {/* Warehouse Dialog removed — warehouses managed at /warehouses */}

      {/* Price List Dialog */}
      <Dialog open={plDialogOpen} onOpenChange={setPlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPriceList ? "Редактировать прайс-лист" : "Новый прайс-лист"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={plForm.name} onChange={(e) => setPlForm({ ...plForm, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Описание</Label>
              <Input value={plForm.description} onChange={(e) => setPlForm({ ...plForm, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlDialogOpen(false)}>Отмена</Button>
            <Button onClick={savePriceList} disabled={savingPriceList}>{savingPriceList ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Field Dialog */}
      <Dialog open={cfDialogOpen} onOpenChange={setCfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCf ? "Редактировать характеристику" : "Новая характеристика"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={cfForm.name} onChange={(e) => setCfForm({ ...cfForm, name: e.target.value })} placeholder="Материал, Цвет, Вес..." />
            </div>
            <div className="grid gap-2">
              <Label>Тип поля</Label>
              <Select value={cfForm.fieldType} onValueChange={(v) => setCfForm({ ...cfForm, fieldType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Текст</SelectItem>
                  <SelectItem value="number">Число</SelectItem>
                  <SelectItem value="select">Список (выбор из вариантов)</SelectItem>
                  <SelectItem value="boolean">Да / Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cfForm.fieldType === "select" && (
              <div className="grid gap-2">
                <Label>Варианты (через запятую)</Label>
                <Input value={cfForm.options} onChange={(e) => setCfForm({ ...cfForm, options: e.target.value })} placeholder="Красный, Синий, Зелёный" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveCf} disabled={savingCf}>{savingCf ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

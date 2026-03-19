"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, Table, type TableColumnsType, Modal, Select, Input } from "antd";
import { Label } from "@/components/ui/label";
import { Tabs } from "antd";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
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
        ? await csrfFetch(`/api/accounting/units/${editingUnit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) })
        : await csrfFetch("/api/accounting/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unitForm) });
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
        ? await csrfFetch(`/api/accounting/price-lists/${editingPriceList.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await csrfFetch("/api/accounting/price-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        ? await csrfFetch(`/api/accounting/custom-fields/${editingCf.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await csrfFetch("/api/accounting/custom-fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
      const res = await csrfFetch(`/api/accounting/custom-fields/${id}`, { method: "DELETE" });
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

  const unitColumns: TableColumnsType<Unit> = [
    { key: "name", dataIndex: "name", title: "Название", render: (name: string) => <span className="font-medium">{name}</span> },
    { key: "shortName", dataIndex: "shortName", title: "Сокращение" },
    {
      key: "actions",
      title: "",
      width: 48,
      render: (_, unit) => (
        <Button variant="ghost" size="icon" onClick={() => openEditUnit(unit)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const priceListColumns: TableColumnsType<PriceList> = [
    { key: "name", dataIndex: "name", title: "Название", render: (name: string) => <span className="font-medium">{name}</span> },
    { key: "description", dataIndex: "description", title: "Описание", render: (desc: string | null) => <span className="text-muted-foreground">{desc || "—"}</span> },
    { key: "prices", dataIndex: ["_count", "prices"], title: "Кол-во цен", align: "right", render: (count: number) => count ?? 0 },
    {
      key: "actions",
      title: "",
      width: 48,
      render: (_, pl) => (
        <Button variant="ghost" size="icon" onClick={() => openEditPriceList(pl)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const customFieldColumns: TableColumnsType<CustomFieldDef> = [
    { key: "name", dataIndex: "name", title: "Название", render: (name: string) => <span className="font-medium">{name}</span> },
    { key: "fieldType", dataIndex: "fieldType", title: "Тип", render: (type: string) => FIELD_TYPE_LABELS[type] || type },
    {
      key: "options",
      dataIndex: "options",
      title: "Опции",
      render: (options: string | null, cf) =>
        cf.fieldType === "select" && options
          ? (JSON.parse(options) as string[]).join(", ")
          : "—",
    },
    {
      key: "actions",
      title: "",
      width: 80,
      render: (_, cf) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEditCf(cf)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteCf(cf.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Справочники" />

      <Tabs
        defaultActiveKey="units"
        tabBarExtraContent={
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1">
              Настройки
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
        items={[
          {
            key: "units",
            label: "Единицы измерения",
            children: (
              <Card title={`Единицы измерения (${units.length})`} extra={
                <Button size="sm" onClick={openCreateUnit}>
                  <Plus className="h-4 w-4 mr-2" />Добавить
                </Button>
              }>
                <Table
                  columns={unitColumns}
                  dataSource={units}
                  rowKey="id"
                  pagination={false}
                  locale={{ emptyText: "Нет единиц измерения" }}
                />
              </Card>
            ),
          },
          {
            key: "pricelists",
            label: "Прайс-листы",
            children: (
              <Card title={`Прайс-листы (${priceLists.length})`} extra={
                <Button size="sm" onClick={openCreatePriceList}>
                  <Plus className="h-4 w-4 mr-2" />Добавить
                </Button>
              }>
                <Table
                  columns={priceListColumns}
                  dataSource={priceLists}
                  rowKey="id"
                  pagination={false}
                  locale={{ emptyText: "Нет прайс-листов" }}
                />
              </Card>
            ),
          },
          {
            key: "customfields",
            label: "Характеристики",
            children: (
              <Card title={`Характеристики товаров (${customFields.length})`} extra={
                <Button size="sm" onClick={openCreateCf}>
                  <Plus className="h-4 w-4 mr-2" />Добавить
                </Button>
              }>
                <Table
                  columns={customFieldColumns}
                  dataSource={customFields}
                  rowKey="id"
                  pagination={false}
                  locale={{ emptyText: "Нет характеристик" }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Unit Dialog */}
      <Modal
        open={unitDialogOpen}
        onCancel={() => setUnitDialogOpen(false)}
        onOk={saveUnit}
        okButtonProps={{ disabled: savingUnit, loading: savingUnit }}
        okText={savingUnit ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingUnit ? "Редактировать единицу" : "Новая единица измерения"}
      >
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
      </Modal>

      {/* Warehouse Dialog removed — warehouses managed at /warehouses */}

      {/* Price List Dialog */}
      <Modal
        open={plDialogOpen}
        onCancel={() => setPlDialogOpen(false)}
        onOk={savePriceList}
        okButtonProps={{ disabled: savingPriceList, loading: savingPriceList }}
        okText={savingPriceList ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingPriceList ? "Редактировать прайс-лист" : "Новый прайс-лист"}
      >
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
      </Modal>

      {/* Custom Field Dialog */}
      <Modal
        open={cfDialogOpen}
        onCancel={() => setCfDialogOpen(false)}
        onOk={saveCf}
        okButtonProps={{ disabled: savingCf, loading: savingCf }}
        okText={savingCf ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingCf ? "Редактировать характеристику" : "Новая характеристика"}
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Название *</Label>
            <Input value={cfForm.name} onChange={(e) => setCfForm({ ...cfForm, name: e.target.value })} placeholder="Материал, Цвет, Вес..." />
          </div>
          <div className="grid gap-2">
            <Label>Тип поля</Label>
            <Select
              value={cfForm.fieldType}
              onChange={(v) => setCfForm({ ...cfForm, fieldType: v })}
              style={{ width: "100%" }}
              options={[
                { value: "text", label: "Текст" },
                { value: "number", label: "Число" },
                { value: "select", label: "Список (выбор из вариантов)" },
                { value: "boolean", label: "Да / Нет" },
              ]}
            />
          </div>
          {cfForm.fieldType === "select" && (
            <div className="grid gap-2">
              <Label>Варианты (через запятую)</Label>
              <Input value={cfForm.options} onChange={(e) => setCfForm({ ...cfForm, options: e.target.value })} placeholder="Красный, Синий, Зелёный" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

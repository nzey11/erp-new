"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Search, Upload, Wand2, Plus, X, ImageIcon, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import type { Product } from "../ProductsTable";
import { ProductStockTab } from "./ProductStockTab";

interface Unit { id: string; name: string; shortName: string; }
interface Category { id: string; name: string; parentId: string | null; }
interface CustomFieldDef { id: string; name: string; fieldType: string; options: string | null; isActive: boolean; }

interface VariantLink {
  id: string;
  linkedProductId: string;
  groupName: string;
  sortOrder: number;
  linkedProduct: {
    id: string; name: string; sku: string | null; imageUrl: string | null; salePrice: number | null;
  };
}

interface ProductDiscount {
  id: string; name: string; type: "percentage" | "fixed"; value: number;
  validFrom: string; validTo: string | null; isActive: boolean;
}

interface ProductCustomField {
  id: string; definitionId: string; value: string; definition: CustomFieldDef;
}

interface VariantSuggestion {
  productId: string;
  product: { id: string; name: string; sku: string | null; imageUrl: string | null; salePrice: number | null };
  confidence: number;
  matchType: "sku" | "name" | "characteristics";
  suggestedGroupName: string;
}

export interface ProductFormContentProps {
  /** null = create mode */
  editingProduct: Product | null;
  units: Unit[];
  categories: Category[];
  onSaved: (savedProduct?: Product) => void;
  onCancel: () => void;
  /** When true, footer buttons rendered as row (dialog style). When false, sticky bottom bar (page style). */
  inDialog?: boolean;
}

export function ProductFormContent({
  editingProduct,
  units,
  categories,
  onSaved,
  onCancel,
  inDialog = false,
}: ProductFormContentProps) {
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [variantLinks, setVariantLinks] = useState<VariantLink[]>([]);
  const [productDiscounts, setProductDiscounts] = useState<ProductDiscount[]>([]);

  // Basic form state
  const [formName, setFormName] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnitId, setFormUnitId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formPurchasePrice, setFormPurchasePrice] = useState("");
  const [formSalePrice, setFormSalePrice] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formSeoTitle, setFormSeoTitle] = useState("");
  const [formSeoDescription, setFormSeoDescription] = useState("");
  const [formSeoKeywords, setFormSeoKeywords] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formPublishedToStore, setFormPublishedToStore] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Inline custom field creation
  const [showNewCfForm, setShowNewCfForm] = useState(false);
  const [newCfName, setNewCfName] = useState("");
  const [newCfType, setNewCfType] = useState("text");
  const [newCfOptions, setNewCfOptions] = useState("");
  const [savingCf, setSavingCf] = useState(false);

  // Variant link form state
  const [variantSearchQuery, setVariantSearchQuery] = useState("");
  const [variantSearchResults, setVariantSearchResults] = useState<Product[]>([]);
  const [variantSearching, setVariantSearching] = useState(false);
  const [newVariantGroupName, setNewVariantGroupName] = useState("");

  // Discount form state
  const [newDiscountName, setNewDiscountName] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newDiscountValidTo, setNewDiscountValidTo] = useState("");

  // Variant suggestions state
  const [suggestions, setSuggestions] = useState<VariantSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantSearchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const reloadCustomFieldDefs = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/custom-fields");
      if (!res.ok) { setCustomFieldDefs([]); return; }
      const data = await res.json();
      setCustomFieldDefs(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { reloadCustomFieldDefs(); }, [reloadCustomFieldDefs]);

  // Populate form when editingProduct changes (also handles initial load)
  useEffect(() => {
    setActiveTab("basic");
    setSuggestionsLoaded(false);
    setSuggestions([]);
    setDismissedSuggestions(new Set());

    if (editingProduct) {
      setFormName(editingProduct.name);
      setFormSku(editingProduct.sku || "");
      setFormBarcode(editingProduct.barcode || "");
      setFormDescription(editingProduct.description || "");
      setFormUnitId(editingProduct.unitId);
      setFormCategoryId(editingProduct.categoryId || "");
      setFormPurchasePrice(editingProduct.purchasePrice != null ? String(editingProduct.purchasePrice) : "");
      setFormSalePrice(editingProduct.salePrice != null ? String(editingProduct.salePrice) : "");
      setFormImageUrl(editingProduct.imageUrl || "");
      setFormSeoTitle(editingProduct.seoTitle || "");
      setFormSeoDescription(editingProduct.seoDescription || "");
      setFormSeoKeywords(editingProduct.seoKeywords || "");
      setFormSlug(editingProduct.slug || "");
      setFormPublishedToStore(editingProduct.publishedToStore ?? false);
      setShowNewCfForm(false);
      setVariantSearchQuery("");
      setVariantSearchResults([]);
      setNewVariantGroupName("");

      Promise.all([
        fetch(`/api/accounting/products/${editingProduct.id}/custom-fields`).then(r => r.ok ? r.json() : []),
        fetch(`/api/accounting/products/${editingProduct.id}/variant-links`).then(r => r.ok ? r.json() : []),
        fetch(`/api/accounting/products/${editingProduct.id}/discounts`).then(r => r.ok ? r.json() : []),
      ]).then(([cfData, vlData, discData]) => {
        setVariantLinks(Array.isArray(vlData) ? vlData : []);
        setProductDiscounts(Array.isArray(discData) ? discData : []);
        const vals: Record<string, string> = {};
        const cfArr = Array.isArray(cfData) ? cfData : [];
        cfArr.forEach((f: ProductCustomField) => { vals[f.definitionId] = f.value; });
        setCustomFieldValues(vals);
      }).catch(() => { /* non-critical */ });
    } else {
      setFormName(""); setFormSku(""); setFormBarcode(""); setFormDescription("");
      setFormUnitId(units[0]?.id || ""); setFormCategoryId("");
      setFormPurchasePrice(""); setFormSalePrice(""); setFormImageUrl("");
      setFormSeoTitle(""); setFormSeoDescription(""); setFormSeoKeywords("");
      setFormSlug(""); setFormPublishedToStore(false);
      setCustomFieldValues({}); setVariantLinks([]); setProductDiscounts([]);
      setShowNewCfForm(false); setNewCfName(""); setNewCfType("text"); setNewCfOptions("");
      setVariantSearchQuery(""); setVariantSearchResults([]); setNewVariantGroupName("");
      setNewDiscountName(""); setNewDiscountType("percentage"); setNewDiscountValue(""); setNewDiscountValidTo("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProduct?.id]);

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/accounting/upload", { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка загрузки"); }
      const { url } = await res.json();
      setFormImageUrl(url);
      toast.success("Фото загружено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки файла");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerateSku = async () => {
    setGeneratingSku(true);
    try {
      const res = await fetch("/api/accounting/sku", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error("Ошибка генерации");
      const { sku } = await res.json();
      setFormSku(sku);
      toast.success(`Артикул: ${sku}`);
    } catch { toast.error("Ошибка генерации артикула"); }
    finally { setGeneratingSku(false); }
  };

  const handleSave = async () => {
    if (!formName || !formUnitId) { toast.error("Название и единица измерения обязательны"); return; }
    setSaving(true);
    try {
      const body = {
        name: formName, sku: formSku || null, barcode: formBarcode || null,
        description: formDescription || null, unitId: formUnitId, categoryId: formCategoryId || null,
        imageUrl: formImageUrl || null, purchasePrice: formPurchasePrice || null, salePrice: formSalePrice || null,
        seoTitle: formSeoTitle || null, seoDescription: formSeoDescription || null,
        seoKeywords: formSeoKeywords || null, slug: formSlug || null,
        publishedToStore: formPublishedToStore,
        ...(!editingProduct && !formSku ? { autoSku: true } : {}),
      };
      const res = editingProduct
        ? await fetch(`/api/accounting/products/${editingProduct.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/accounting/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка сохранения"); }
      const savedProduct = await res.json();

      const cfEntries = Object.entries(customFieldValues).filter(([, v]) => v !== "");
      if (cfEntries.length > 0) {
        const productId = editingProduct?.id || savedProduct.id;
        await fetch(`/api/accounting/products/${productId}/custom-fields`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: cfEntries.map(([definitionId, value]) => ({ definitionId, value })) }),
        });
      }
      toast.success(editingProduct ? "Товар обновлён" : "Товар создан");
      onSaved(savedProduct as Product);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const handleCreateCf = async () => {
    if (!newCfName) { toast.error("Введите название характеристики"); return; }
    setSavingCf(true);
    try {
      const body: Record<string, unknown> = { name: newCfName, fieldType: newCfType };
      if (newCfType === "select" && newCfOptions) {
        body.options = newCfOptions.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const res = await fetch("/api/accounting/custom-fields", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка"); }
      toast.success("Характеристика создана");
      setNewCfName(""); setNewCfType("text"); setNewCfOptions(""); setShowNewCfForm(false);
      await reloadCustomFieldDefs();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка создания"); }
    finally { setSavingCf(false); }
  };

  const handleDeleteCf = async (cfId: string) => {
    try {
      const res = await fetch(`/api/accounting/custom-fields/${cfId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка");
      toast.success("Характеристика удалена");
      setCustomFieldValues((prev) => { const next = { ...prev }; delete next[cfId]; return next; });
      await reloadCustomFieldDefs();
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleVariantSearch = (query: string) => {
    setVariantSearchQuery(query);
    if (variantSearchTimeout.current) clearTimeout(variantSearchTimeout.current);
    if (!query || query.length < 2) { setVariantSearchResults([]); return; }
    variantSearchTimeout.current = setTimeout(async () => {
      setVariantSearching(true);
      try {
        const params = new URLSearchParams({ search: query, limit: "10" });
        const res = await fetch(`/api/accounting/products?${params}`);
        if (!res.ok) { setVariantSearchResults([]); return; }
        const data = await res.json();
        const dataArr = Array.isArray(data.data) ? data.data : [];
        const results = dataArr.filter(
          (p: Product) => p.id !== editingProduct?.id && !variantLinks.some((vl) => vl.linkedProductId === p.id)
        );
        setVariantSearchResults(results);
      } catch { /* ignore */ }
      finally { setVariantSearching(false); }
    }, 300);
  };

  const handleAddVariantLink = async (linkedProduct: Product) => {
    if (!editingProduct || !newVariantGroupName) {
      toast.error("Укажите название группы (напр. Цвет, Размер)");
      return;
    }
    try {
      const res = await fetch(`/api/accounting/products/${editingProduct.id}/variant-links`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedProductId: linkedProduct.id, groupName: newVariantGroupName }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка"); }
      const link: VariantLink = await res.json();
      setVariantLinks((prev) => [...prev, link]);
      setVariantSearchQuery(""); setVariantSearchResults([]);
      toast.success("Модификация привязана");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка привязки"); }
  };

  const handleRemoveVariantLink = async (linkId: string) => {
    if (!editingProduct) return;
    try {
      await fetch(`/api/accounting/products/${editingProduct.id}/variant-links?linkId=${linkId}`, { method: "DELETE" });
      setVariantLinks((prev) => prev.filter((vl) => vl.id !== linkId));
      toast.success("Связь удалена");
    } catch { toast.error("Ошибка удаления"); }
  };

  const loadSuggestions = useCallback(async () => {
    if (!editingProduct || suggestionsLoaded) return;
    setSuggestionsLoading(true);
    try {
      const res = await fetch(`/api/accounting/products/${editingProduct.id}/suggestions?minConfidence=40`);
      if (!res.ok) { setSuggestions([]); return; }
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setSuggestionsLoaded(true);
    } catch { setSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  }, [editingProduct, suggestionsLoaded]);

  const handleAcceptSuggestion = async (suggestion: VariantSuggestion) => {
    if (!editingProduct) return;
    try {
      const res = await fetch(`/api/accounting/products/${editingProduct.id}/variant-links`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedProductId: suggestion.productId, groupName: suggestion.suggestedGroupName }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка"); }
      const link: VariantLink = await res.json();
      setVariantLinks((prev) => [...prev, link]);
      setSuggestions((prev) => prev.filter((s) => s.productId !== suggestion.productId));
      toast.success("Модификация привязана");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка привязки"); }
  };

  const handleDismissSuggestion = (productId: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, productId]));
  };

  const handleAcceptAllHighConfidence = async () => {
    const highConfidence = suggestions.filter((s) => s.confidence >= 80 && !dismissedSuggestions.has(s.productId));
    for (const s of highConfidence) { await handleAcceptSuggestion(s); }
  };

  useEffect(() => {
    if (activeTab === "suggestions" && editingProduct && !suggestionsLoaded) {
      loadSuggestions();
    }
  }, [activeTab, editingProduct, suggestionsLoaded, loadSuggestions]);

  const handleAddDiscount = async () => {
    if (!editingProduct || !newDiscountName || !newDiscountValue) { toast.error("Название и значение скидки обязательны"); return; }
    try {
      const res = await fetch(`/api/accounting/products/${editingProduct.id}/discounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDiscountName, type: newDiscountType, value: parseFloat(newDiscountValue), validTo: newDiscountValidTo || null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Ошибка"); }
      const discount: ProductDiscount = await res.json();
      setProductDiscounts((prev) => [discount, ...prev]);
      setNewDiscountName(""); setNewDiscountValue(""); setNewDiscountValidTo("");
      toast.success("Скидка добавлена");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка добавления скидки"); }
  };

  const handleRemoveDiscount = async (discountId: string) => {
    if (!editingProduct) return;
    try {
      await fetch(`/api/accounting/products/${editingProduct.id}/discounts?discountId=${discountId}`, { method: "DELETE" });
      setProductDiscounts((prev) => prev.filter((d) => d.id !== discountId));
      toast.success("Скидка удалена");
      onSaved();
    } catch { toast.error("Ошибка удаления"); }
  };

  const calcDiscountedPrice = (): number | null => {
    const salePrice = formSalePrice ? parseFloat(formSalePrice) : null;
    if (salePrice == null || productDiscounts.length === 0) return null;
    const d = productDiscounts[0];
    return d.type === "percentage"
      ? Math.round(salePrice * (1 - d.value / 100) * 100) / 100
      : Math.round((salePrice - d.value) * 100) / 100;
  };

  const FIELD_TYPE_LABELS: Record<string, string> = { text: "Текст", number: "Число", select: "Список", boolean: "Да/Нет" };

  const footer = (
    <div className={inDialog ? "flex justify-end gap-2 pt-4" : "flex justify-end gap-2 pt-6 border-t mt-2"}>
      <Button variant="outline" onClick={onCancel}>Отмена</Button>
      <Button onClick={handleSave} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
    </div>
  );

  return (
    <div className={inDialog ? "" : "space-y-4"}>
      <Tabs defaultValue="basic" value={activeTab} className="w-full" onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="basic">Основное</TabsTrigger>
          <TabsTrigger value="characteristics">Характеристики</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          {editingProduct && <TabsTrigger value="stock">Склад</TabsTrigger>}
          {editingProduct && <TabsTrigger value="variants">Модификации</TabsTrigger>}
          {editingProduct && <TabsTrigger value="suggestions">Подсказки</TabsTrigger>}
          {editingProduct && <TabsTrigger value="discounts">Скидки</TabsTrigger>}
        </TabsList>

        {/* === Basic Tab === */}
        <TabsContent value="basic">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Фото товара</Label>
              <div className="flex items-center gap-4">
                {formImageUrl ? (
                  <div className="relative">
                    <img src={formImageUrl} alt="Preview" className="h-20 w-20 rounded-lg object-cover border" />
                    <button type="button" className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      onClick={() => setFormImageUrl("")}><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden" onChange={handleUploadImage} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                    <Upload className="h-4 w-4 mr-2" />{uploadingImage ? "Загрузка..." : "Загрузить фото"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP, GIF. Макс. 5 МБ</p>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Название *</Label>
              <Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sku">Артикул</Label>
                <div className="flex gap-2">
                  <Input id="sku" value={formSku} onChange={(e) => setFormSku(e.target.value)} placeholder="Авто" className="flex-1" />
                  <Button variant="outline" size="icon" onClick={handleGenerateSku} disabled={generatingSku} title="Сгенерировать артикул">
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="barcode">Штрихкод</Label>
                <Input id="barcode" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Единица измерения *</Label>
                <Select value={formUnitId} onValueChange={setFormUnitId}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name} ({u.shortName})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Категория</Label>
                <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Без категории" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="purchasePrice">Цена закупки</Label>
                <Input id="purchasePrice" type="number" min="0" step="0.01" placeholder="0.00"
                  value={formPurchasePrice} onChange={(e) => setFormPurchasePrice(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salePrice">Цена продажи</Label>
                <Input id="salePrice" type="number" min="0" step="0.01" placeholder="0.00"
                  value={formSalePrice} onChange={(e) => setFormSalePrice(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc">Описание</Label>
              <Textarea id="desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-3 pt-2 border-t">
              <button type="button" role="switch" aria-checked={formPublishedToStore}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${formPublishedToStore ? "bg-blue-500" : "bg-muted"}`}
                onClick={() => setFormPublishedToStore(!formPublishedToStore)}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${formPublishedToStore ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <div>
                <Label className="cursor-pointer" onClick={() => setFormPublishedToStore(!formPublishedToStore)}>
                  Размещать в интернет-магазине
                </Label>
                <p className="text-xs text-muted-foreground">Товар будет доступен на сайте для покупателей</p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* === Characteristics Tab === */}
        <TabsContent value="characteristics">
          <div className="grid gap-4 py-4">
            {customFieldDefs.length > 0 && customFieldDefs.map((def) => (
              <div key={def.id} className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{def.name} <span className="text-muted-foreground text-xs">({FIELD_TYPE_LABELS[def.fieldType] || def.fieldType})</span></Label>
                  <div className="flex gap-1">
                    {customFieldValues[def.id] && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Очистить"
                        onClick={() => setCustomFieldValues((prev) => { const next = { ...prev }; delete next[def.id]; return next; })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" title="Удалить характеристику"
                      onClick={() => handleDeleteCf(def.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {def.fieldType === "boolean" ? (
                  <Select value={customFieldValues[def.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Не задано" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Да</SelectItem>
                      <SelectItem value="false">Нет</SelectItem>
                    </SelectContent>
                  </Select>
                ) : def.fieldType === "select" && def.options ? (
                  <Select value={customFieldValues[def.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                    <SelectContent>
                      {(JSON.parse(def.options) as string[]).map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type={def.fieldType === "number" ? "number" : "text"}
                    value={customFieldValues[def.id] || ""}
                    onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: e.target.value }))} />
                )}
              </div>
            ))}
            {showNewCfForm ? (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <Label className="text-sm font-medium">Новая характеристика</Label>
                <Input placeholder="Название (напр. Материал, Вес...)" value={newCfName}
                  onChange={(e) => setNewCfName(e.target.value)} />
                <Select value={newCfType} onValueChange={setNewCfType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Текст</SelectItem>
                    <SelectItem value="number">Число</SelectItem>
                    <SelectItem value="select">Список (выбор)</SelectItem>
                    <SelectItem value="boolean">Да / Нет</SelectItem>
                  </SelectContent>
                </Select>
                {newCfType === "select" && (
                  <Input placeholder="Варианты через запятую (Красный, Синий...)" value={newCfOptions}
                    onChange={(e) => setNewCfOptions(e.target.value)} />
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateCf} disabled={!newCfName || savingCf}>
                    {savingCf ? "Создание..." : "Создать"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewCfForm(false)}>Отмена</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowNewCfForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />Добавить характеристику
                </Button>
                <Link href="/references?tab=customfields" onClick={onCancel}>
                  <Button variant="link" size="sm" className="px-0 text-muted-foreground">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Справочники
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </TabsContent>

        {/* === SEO Tab === */}
        <TabsContent value="seo">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="seoTitle">SEO заголовок</Label>
              <Input id="seoTitle" value={formSeoTitle} onChange={(e) => setFormSeoTitle(e.target.value)}
                placeholder={formName || "Название товара"} />
              <p className="text-xs text-muted-foreground">{formSeoTitle.length}/60 символов</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="seoDesc">SEO описание</Label>
              <Textarea id="seoDesc" value={formSeoDescription} onChange={(e) => setFormSeoDescription(e.target.value)}
                placeholder="Описание для поисковых систем" rows={3} />
              <p className="text-xs text-muted-foreground">{formSeoDescription.length}/160 символов</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="seoKeywords">SEO ключевые слова</Label>
              <Input id="seoKeywords" value={formSeoKeywords} onChange={(e) => setFormSeoKeywords(e.target.value)}
                placeholder="слово1, слово2, слово3" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">URL-slug</Label>
              <Input id="slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)}
                placeholder="auto-generated-from-name" />
              <p className="text-xs text-muted-foreground">Оставьте пустым для автогенерации</p>
            </div>
          </div>
        </TabsContent>

        {/* === Stock Tab === */}
        {editingProduct && (
          <TabsContent value="stock">
            <ProductStockTab productId={editingProduct.id} isActive={activeTab === "stock"} />
          </TabsContent>
        )}

        {/* === Variants Tab === */}
        {editingProduct && (
          <TabsContent value="variants">
            <div className="grid gap-4 py-4">
              <p className="text-xs text-muted-foreground">
                Модификации связывают товары для отображения на сайте в одной карточке. Каждая модификация — отдельный товар со своей ценой, складом и скидками.
              </p>
              {variantLinks.length > 0 && (
                <div className="space-y-2">
                  <Label>Привязанные товары</Label>
                  <div className="border rounded-lg divide-y">
                    {variantLinks.map((vl) => (
                      <div key={vl.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">{vl.groupName}</Badge>
                              <span className="font-medium truncate">{vl.linkedProduct.name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {vl.linkedProduct.sku && <span>Арт: {vl.linkedProduct.sku}</span>}
                              {vl.linkedProduct.salePrice != null && <span className="ml-2">{formatRub(vl.linkedProduct.salePrice)}</span>}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemoveVariantLink(vl.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <Label>Привязать товар</Label>
                <Input placeholder="Группа (напр. Цвет, Размер, Объём...)" value={newVariantGroupName}
                  onChange={(e) => setNewVariantGroupName(e.target.value)} />
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Поиск товара по названию или артикулу..." value={variantSearchQuery}
                    onChange={(e) => handleVariantSearch(e.target.value)} className="pl-10" />
                </div>
                {variantSearching && <p className="text-xs text-muted-foreground">Поиск...</p>}
                {variantSearchResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {variantSearchResults.map((p) => (
                      <button key={p.id} type="button"
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left"
                        onClick={() => handleAddVariantLink(p)}>
                        <div className="min-w-0">
                          <span className="font-medium">{p.name}</span>
                          {p.sku && <span className="text-muted-foreground ml-2">({p.sku})</span>}
                        </div>
                        {p.salePrice != null && (
                          <span className="text-muted-foreground shrink-0 ml-2">{formatRub(p.salePrice)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {variantSearchQuery.length >= 2 && !variantSearching && variantSearchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ничего не найдено</p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* === Suggestions Tab === */}
        {editingProduct && (
          <TabsContent value="suggestions">
            <div className="grid gap-4 py-4">
              <p className="text-xs text-muted-foreground">
                Умные подсказки находят похожие товары по артикулу, названию и характеристикам.
              </p>
              {suggestionsLoading && <p className="text-sm text-muted-foreground">Загрузка подсказок...</p>}
              {!suggestionsLoading && suggestions.filter((s) => !dismissedSuggestions.has(s.productId)).length === 0 && (
                <p className="text-sm text-muted-foreground">Подсказок не найдено.</p>
              )}
              {suggestions.filter((s) => !dismissedSuggestions.has(s.productId) && s.confidence >= 80).length > 1 && (
                <Button variant="outline" size="sm" onClick={handleAcceptAllHighConfidence}>
                  Принять все с высокой уверенностью ({suggestions.filter((s) => s.confidence >= 80).length})
                </Button>
              )}
              {suggestions.filter((s) => !dismissedSuggestions.has(s.productId)).length > 0 && (
                <div className="border rounded-lg divide-y">
                  {suggestions.filter((s) => !dismissedSuggestions.has(s.productId)).map((s) => (
                    <div key={s.productId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {s.product.imageUrl ? (
                          <img src={s.product.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{s.product.name}</span>
                            <Badge variant={s.confidence >= 80 ? "default" : s.confidence >= 60 ? "secondary" : "outline"}
                              className="text-[10px] px-1 py-0 shrink-0">{s.confidence}%</Badge>
                            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                              {s.matchType === "sku" ? "Артикул" : s.matchType === "name" ? "Название" : "Характеристики"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.product.sku && <span>Арт: {s.product.sku}</span>}
                            {s.product.salePrice != null && <span className="ml-2">{formatRub(s.product.salePrice)}</span>}
                            <span className="ml-2">→ {s.suggestedGroupName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 text-green-600 hover:text-green-700"
                          onClick={() => handleAcceptSuggestion(s)}>Принять</Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDismissSuggestion(s.productId)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* === Discounts Tab === */}
        {editingProduct && (
          <TabsContent value="discounts">
            <div className="grid gap-4 py-4">
              {productDiscounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Активные скидки</Label>
                  <div className="border rounded-lg divide-y">
                    {productDiscounts.map((d) => {
                      const sp = formSalePrice ? parseFloat(formSalePrice) : null;
                      let dp: number | null = null;
                      if (sp != null) {
                        dp = d.type === "percentage" ? Math.round(sp * (1 - d.value / 100) * 100) / 100 : Math.round((sp - d.value) * 100) / 100;
                      }
                      return (
                        <div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{d.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {d.type === "percentage" ? `${d.value}%` : formatRub(d.value)}
                            </span>
                            {dp != null && <span className="text-green-600 ml-2">{formatRub(dp)}</span>}
                            {d.validTo && (
                              <span className="text-xs text-muted-foreground ml-2">
                                до {new Date(d.validTo).toLocaleDateString("ru")}
                              </span>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveDiscount(d.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  {calcDiscountedPrice() != null && (
                    <p className="text-sm">Итого со скидкой: <span className="text-green-600 font-medium">{formatRub(calcDiscountedPrice()!)}</span></p>
                  )}
                </div>
              )}
              <div className="space-y-3">
                <Label>Новая скидка</Label>
                <div className="grid gap-3">
                  <Input placeholder="Название (напр. Летняя распродажа)" value={newDiscountName}
                    onChange={(e) => setNewDiscountName(e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={newDiscountType} onValueChange={(v) => setNewDiscountType(v as "percentage" | "fixed")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Процент (%)</SelectItem>
                        <SelectItem value="fixed">Фикс. сумма</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" placeholder={newDiscountType === "percentage" ? "10" : "500"}
                      value={newDiscountValue} onChange={(e) => setNewDiscountValue(e.target.value)} />
                    <Input type="date" value={newDiscountValidTo} onChange={(e) => setNewDiscountValidTo(e.target.value)} />
                  </div>
                  {formPurchasePrice && (
                    <p className="text-xs text-muted-foreground">
                      Себестоимость: {formatRub(parseFloat(formPurchasePrice))}. Скидка не может снизить цену ниже этого значения.
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleAddDiscount} disabled={!newDiscountName || !newDiscountValue}>
                  <Plus className="h-4 w-4 mr-2" /> Добавить скидку
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {footer}
    </div>
  );
}

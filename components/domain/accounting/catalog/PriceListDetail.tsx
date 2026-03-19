"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "antd";
import type { TableColumnsType } from "antd";
import { Modal } from "antd";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";

interface PriceList {
  id: string;
  name: string;
  description: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  unit?: { shortName: string };
}

interface PriceRecord {
  id: string;
  productId: string;
  price: number;
  minQuantity: number;
  validFrom: string;
  validTo: string | null;
  product: Product;
}

interface PriceListDetailProps {
  priceList: PriceList;
  onBack: () => void;
}

export function PriceListDetail({ priceList, onBack }: PriceListDetailProps) {
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add product dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newMinQty, setNewMinQty] = useState("1");
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const loadPrices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/accounting/price-lists/${priceList.id}/prices?${params}`);
      if (!res.ok) { setPrices([]); return; }
      const data = await res.json();
      setPrices(Array.isArray(data.prices) ? data.prices : []);
    } catch {
      toast.error("Ошибка загрузки цен");
    } finally {
      setLoading(false);
    }
  }, [priceList.id, search]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  const handleProductSearch = (query: string) => {
    setProductSearch(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query || query.length < 2) {
      setProductResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: query, limit: "10" });
        const res = await fetch(`/api/accounting/products?${params}`);
        if (!res.ok) { setProductResults([]); return; }
        const data = await res.json();
        // Filter out products already in price list
        const existingIds = new Set(prices.map((p) => p.productId));
        const results = Array.isArray(data.data) ? data.data : [];
        setProductResults(results.filter((p: Product) => !existingIds.has(p.id)));
      } catch {
        setProductResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSearch("");
    setProductResults([]);
  };

  const handleAddPrice = async () => {
    if (!selectedProduct || !newPrice) {
      toast.error("Выберите товар и укажите цену");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/price-lists/${priceList.id}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          price: parseFloat(newPrice),
          minQuantity: parseInt(newMinQty) || 1,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Цена добавлена");
      setAddDialogOpen(false);
      setSelectedProduct(null);
      setNewPrice("");
      setNewMinQty("1");
      loadPrices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка добавления");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrice = async (priceRecord: PriceRecord) => {
    if (!confirm(`Удалить цену для "${priceRecord.product.name}"?`)) return;
    try {
      const res = await fetch(
        `/api/accounting/price-lists/${priceList.id}/prices?priceId=${priceRecord.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Цена удалена");
      loadPrices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const columns: TableColumnsType<PriceRecord> = [
    {
      key: "product",
      title: "Товар",
      render: (_, record) => (
        <div className="flex items-center gap-3">
          {record.product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.product.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="h-8 w-8 rounded bg-muted" />
          )}
          <span className="font-medium">{record.product.name}</span>
        </div>
      ),
    },
    {
      key: "sku",
      title: "Артикул",
      render: (_, record) => <span className="text-muted-foreground">{record.product.sku || "—"}</span>,
    },
    {
      key: "price",
      title: "Цена",
      align: "right",
      render: (_, record) =>
        editingId === record.id ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-28 h-8 text-right"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(record);
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEdit(record)}>
              <Save className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button className="hover:underline" onClick={() => startEdit(record)}>
            {formatRub(record.price)}
          </button>
        ),
    },
    {
      key: "minQuantity",
      title: "Мин. кол-во",
      align: "right",
      render: (_, record) => (
        <span className="text-muted-foreground">
          {record.minQuantity} {record.product.unit?.shortName || "шт."}
        </span>
      ),
    },
    {
      key: "actions",
      title: "",
      width: 80,
      render: (_, record) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => handleDeletePrice(record)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const startEdit = (record: PriceRecord) => {
    setEditingId(record.id);
    setEditPrice(String(record.price));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const saveEdit = async (record: PriceRecord) => {
    const priceValue = parseFloat(editPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      toast.error("Некорректная цена");
      return;
    }
    try {
      const res = await fetch(`/api/accounting/price-lists/${priceList.id}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: record.productId,
          price: priceValue,
          minQuantity: record.minQuantity,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Цена обновлена");
      setEditingId(null);
      loadPrices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-lg font-semibold">{priceList.name}</h3>
          {priceList.description && (
            <p className="text-sm text-muted-foreground">{priceList.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по товарам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить товар
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : prices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <p className="mb-2">В прайс-листе нет товаров</p>
          <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить первый товар
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table
            columns={columns}
            dataSource={prices}
            rowKey="id"
            pagination={false}
          />
        </div>
      )}

      <Modal
        open={addDialogOpen}
        onCancel={() => setAddDialogOpen(false)}
        onOk={handleAddPrice}
        okButtonProps={{ disabled: saving || !selectedProduct || !newPrice, loading: saving }}
        okText={saving ? "Добавление..." : "Добавить"}
        cancelText="Отмена"
        title="Добавить товар в прайс-лист"
      >
        <div className="grid gap-4 py-4">
            {selectedProduct ? (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                {selectedProduct.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedProduct.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedProduct.name}</p>
                  {selectedProduct.sku && (
                    <p className="text-xs text-muted-foreground">{selectedProduct.sku}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProduct(null)}
                >
                  Изменить
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Поиск товара</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Введите название или артикул..."
                    value={productSearch}
                    onChange={(e) => handleProductSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {searching && (
                  <p className="text-xs text-muted-foreground">Поиск...</p>
                )}
                {productResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                        onClick={() => handleSelectProduct(p)}
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {productSearch.length >= 2 && !searching && productResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ничего не найдено</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Цена *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Мин. количество</Label>
                <Input
                  type="number"
                  min="1"
                  value={newMinQty}
                  onChange={(e) => setNewMinQty(e.target.value)}
                />
              </div>
            </div>
          </div>
      </Modal>
    </div>
  );
}

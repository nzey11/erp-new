"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client/csrf";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "antd";
import { Card } from "antd";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Modal } from "antd";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dropdown, Tabs } from "antd";
import type { MenuProps } from "antd";
import { Check, X, Plus, Trash2, ArrowLeft, Link2, BookOpen, Printer, Database, RefreshCw, Edit2, MinusCircle, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { formatRub, formatDate, formatDateTime } from "@/lib/shared/utils";
import Link from "next/link";

interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  amountRub: number;
}

interface JournalEntryDisplay {
  id: string;
  number: string;
  date: string;
  description: string | null;
  isManual: boolean;
  isReversed: boolean;
  lines: JournalLine[];
}

interface DocumentItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
  expectedQty: number | null;
  actualQty: number | null;
  difference: number | null;
  product: { id: string; name: string; sku: string | null; unit?: { shortName: string } };
}

interface DocumentDetail {
  id: string;
  number: string;
  type: string;
  typeName: string;
  status: string;
  statusName: string;
  date: string;
  totalAmount: number;
  description: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  cancelledAt: string | null;
  warehouse: { id: string; name: string } | null;
  targetWarehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
  items: DocumentItem[];
  linkedDocument: { id: string; number: string; type: string; typeName?: string } | null;
  linkedFrom: { id: string; number: string; type: string; typeName?: string }[];
}

interface Product { id: string; name: string; sku: string | null; purchasePrice: number | null; salePrice: number | null }

const STATUS_TAG_COLORS: Record<string, string> = {
  draft: "default",
  confirmed: "green",
  cancelled: "red",
};

// Linked document type mapping: source type -> possible next document types
const LINKED_DOC_TYPES: Record<string, Array<{ type: string; label: string }>> = {
  purchase_order: [
    { type: "incoming_shipment", label: "Создать приёмку" },
    { type: "outgoing_payment", label: "Создать исходящий платёж" },
  ],
  incoming_shipment: [
    { type: "outgoing_payment", label: "Создать исходящий платёж" },
    { type: "supplier_return", label: "Создать возврат поставщику" },
  ],
  sales_order: [
    { type: "outgoing_shipment", label: "Создать отгрузку" },
    { type: "incoming_payment", label: "Создать входящий платёж" },
  ],
  outgoing_shipment: [
    { type: "incoming_payment", label: "Создать входящий платёж" },
    { type: "customer_return", label: "Создать возврат покупателя" },
  ],
};

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [itemProductId, setItemProductId] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemPrice, setItemPrice] = useState("0");
  const [saving, setSaving] = useState(false);
  const [creatingLinked, setCreatingLinked] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntryDisplay[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/documents/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDoc(data);
    } catch {
      toast.error("Документ не найден");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  // Initialize editingActualQty from loaded items (for inventory_count documents)
  // Use doc.id as dependency to prevent re-initialization on every render
  useEffect(() => {
    if (doc?.type === "inventory_count" && doc.items.length > 0) {
      const initial: Record<number, string> = {};
      doc.items.forEach((item, i) => {
        // Always initialize, use 0 as default for null/undefined
        initial[i] = String(item.actualQty ?? 0);
      });
      setEditingActualQty(initial);
    }
  }, [doc?.id, doc?.type]);

  const loadJournalEntries = useCallback(async () => {
    setJournalLoading(true);
    try {
      const res = await fetch(`/api/accounting/documents/${id}/journal`);
      if (res.ok) {
        const data = await res.json();
        setJournalEntries(Array.isArray(data) ? data : []);
      }
    } catch {
      // Non-critical: journal entries may not exist yet
    } finally {
      setJournalLoading(false);
    }
  }, [id]);

  useEffect(() => { loadJournalEntries(); }, [loadJournalEntries]);

  // Product search with debounce (replaces static limit=500 fetch)
  const [productSearch, setProductSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "20" });
      if (productSearch) params.set("search", productSearch);
      fetch(`/api/accounting/products?${params}`)
        .then((r) => r.ok ? r.json() : { data: [] })
        .then((data) => setProducts(Array.isArray(data.data) ? data.data : []));
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Inline edit state: key = item index
  const [editingItems, setEditingItems] = useState<Record<number, { quantity: string; price: string }>>({});

  // Inventory count: actualQty inline edit state (key = item index)
  const [editingActualQty, setEditingActualQty] = useState<Record<number, string>>({});

  // Inventory count: stock lookup state for "add item" dialog
  const [itemExpectedQty, setItemExpectedQty] = useState<number>(0);
  const [fillingStock, setFillingStock] = useState(false);
  const [fillingAll, setFillingAll] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [creatingLinkedAdj, setCreatingLinkedAdj] = useState(false);

  // "Заполнить по складу" — calls existing /fill-inventory endpoint
  const handleFillFromStock = async () => {
    if (!doc) return;
    if (!doc.warehouse) {
      toast.warning("Сначала укажите склад в документе");
      return;
    }
    setFillingStock(true);
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/fill-inventory`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      const data = await res.json();
      const itemCount = Array.isArray(data.items) ? data.items.length : 0;
      toast.success(`Заполнено ${itemCount} позиций по складу`);
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка заполнения");
    } finally {
      setFillingStock(false);
    }
  };

  // Button B — "Заполнить все товары": fills ALL products (even with zero stock)
  const handleFillAllProducts = async () => {
    if (!doc) return;
    if (!doc.warehouse) {
      toast.warning("Сначала укажите склад в документе");
      return;
    }
    setFillingAll(true);
    try {
      const [recordsRes, productsRes] = await Promise.all([
        fetch(`/api/accounting/stock/records?warehouseId=${doc.warehouse.id}&includeZero=true`),
        fetch(`/api/accounting/products?limit=500`),
      ]);
      const recordsJson = recordsRes.ok ? await recordsRes.json() : {};
      const productsJson = productsRes.ok ? await productsRes.json() : {};
      const records: Array<{ productId: string; quantity: number; averageCost: number }> =
        Array.isArray(recordsJson.records) ? recordsJson.records : [];
      const productsList: Array<{ id: string; name: string }> =
        Array.isArray(productsJson.data) ? productsJson.data : [];
      const recordMap = new Map<string, { quantity: number; averageCost: number }>(
        records.map((r) => [r.productId, r])
      );
      const currentItems = productsList.map((p) => {
        const record = recordMap.get(p.id);
        return {
          productId: p.id,
          quantity: 0,
          price: record?.averageCost ?? 0,
          expectedQty: record?.quantity ?? 0,
          actualQty: 0,
        };
      });
      const res = await csrfFetch(`/api/accounting/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: currentItems }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(`Заполнено ${currentItems.length} товаров (все позиции, факт = 0)`);
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка заполнения");
    } finally {
      setFillingAll(false);
    }
  };

  // Create linked adjustment document manually (write_off for shortages, stock_receipt for surpluses)
  const handleCreateAdjustment = async (type: "write_off" | "stock_receipt") => {
    if (!doc) return;
    setCreatingLinkedAdj(true);
    try {
      const relevantItems = doc.items.filter((i) =>
        type === "write_off"
          ? (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) < 0
          : (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) > 0
      );
      const body = {
        type,
        status: "draft",
        warehouseId: doc.warehouse?.id ?? null,
        date: new Date().toISOString(),
        description: `На основании инвентаризации ${doc.number}`,
        linkedDocumentId: doc.id,
        items: relevantItems.map((item) => ({
          productId: item.productId,
          quantity: Math.abs(item.difference ?? Math.abs((item.actualQty ?? 0) - (item.expectedQty ?? 0))),
          price: item.price,
        })),
      };
      const res = await csrfFetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      const newDoc = await res.json();
      toast.success("Документ создан как черновик");
      router.push(`/documents/${newDoc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setCreatingLinkedAdj(false);
    }
  };

  // Reopen confirmed stock document: reverse journal entries + set status to draft
  const handleReopen = async () => {
    if (!doc) return;
    if (!confirm("Открыть документ для редактирования?\n\nПроводки будут отменены. После изменений нужно повторно подтвердить документ.")) return;
    setReopening(true);
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/reopen`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Документ открыт для редактирования");
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setReopening(false);
    }
  };

  // Inventory count: save actualQty for one item (sends full items array with updated actualQty)
  const handleUpdateActualQty = async (index: number, newActualQty: number) => {
    if (!doc) return;
    const currentItems = doc.items.map((item, i) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      expectedQty: item.expectedQty ?? undefined,
      actualQty: i === index ? newActualQty : (item.actualQty ?? undefined),
    }));
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: currentItems }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      setEditingActualQty((prev) => { const next = { ...prev }; delete next[index]; return next; });
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  // When product is selected — auto-fill price based on document type
  // For inventory_count: also fetch current stock quantity to pre-fill expectedQty
  const handleProductSelect = async (productId: string) => {
    setItemProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (!product || !doc) return;
    const isPurchase = ["incoming_shipment", "purchase_order", "supplier_return", "stock_receipt"].includes(doc.type);
    const isSale = ["outgoing_shipment", "sales_order", "customer_return"].includes(doc.type);
    if (isPurchase && product.purchasePrice != null) {
      setItemPrice(String(product.purchasePrice));
    } else if (isSale && product.salePrice != null) {
      setItemPrice(String(product.salePrice));
    }
    // For inventory_count: fetch current stock to pre-fill expectedQty/actualQty
    if (doc.type === "inventory_count" && doc.warehouse) {
      try {
        const params = new URLSearchParams({ warehouseId: doc.warehouse.id, productId, enhanced: "true" });
        const res = await fetch(`/api/accounting/stock?${params}`);
        if (res.ok) {
          const data = await res.json();
          const record = Array.isArray(data.records) ? data.records[0] : null;
          const currentStock = record ? Number(record.quantity) : 0;
          const avgCost = record?.averageCost != null ? Number(record.averageCost) : 0;
          setItemExpectedQty(currentStock);
          setItemQuantity(String(currentStock));
          if (avgCost > 0) setItemPrice(String(avgCost));
        }
      } catch {
        // Non-critical: stock fetch failed, keep defaults
      }
    }
  };

  // Inline item update handler
  const handleUpdateItem = async (index: number, quantity: number, price: number) => {
    if (!doc) return;
    const currentItems = doc.items.map((item, i) => ({
      productId: item.productId,
      quantity: i === index ? quantity : item.quantity,
      price: i === index ? price : item.price,
    }));
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: currentItems }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      // Clear editing state and reload
      setEditingItems((prev) => { const next = { ...prev }; delete next[index]; return next; });
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  const handleConfirm = async () => {
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Документ подтверждён");
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleCancel = async () => {
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Документ отменён");
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить документ?")) return;
    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }
      toast.success("Документ удалён");
      router.push("/documents");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleAddItem = async () => {
    if (!itemProductId || !doc) return;
    setSaving(true);
    try {
      const isInventory = doc.type === "inventory_count";
      const currentItems = doc.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        ...(isInventory && {
          expectedQty: item.expectedQty ?? undefined,
          actualQty: item.actualQty ?? undefined,
        }),
      }));
      const qty = parseFloat(itemQuantity) || 0;
      const newItem: Record<string, unknown> = {
        productId: itemProductId,
        quantity: isInventory ? 0 : (parseFloat(itemQuantity) || 1),
        price: parseFloat(itemPrice) || 0,
      };
      if (isInventory) {
        newItem.expectedQty = itemExpectedQty;
        newItem.actualQty = qty;
      }
      currentItems.push(newItem as typeof currentItems[0]);

      const res = await csrfFetch(`/api/accounting/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: currentItems }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Позиция добавлена");
      setAddItemOpen(false);
      setItemProductId("");
      setItemQuantity("1");
      setItemPrice("0");
      setItemExpectedQty(0);
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (removeIndex: number) => {
    if (!doc) return;
    const isInventory = doc.type === "inventory_count";
    const currentItems = doc.items
      .filter((_, i) => i !== removeIndex)
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        ...(isInventory && {
          expectedQty: item.expectedQty ?? undefined,
          actualQty: item.actualQty ?? undefined,
        }),
      }));

    try {
      const res = await csrfFetch(`/api/accounting/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: currentItems }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Позиция удалена");
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleCreateLinkedDoc = async (newType: string) => {
    if (!doc) return;
    setCreatingLinked(true);
    try {
      const isPayment = newType === "incoming_payment" || newType === "outgoing_payment";

      const body: Record<string, unknown> = {
        type: newType,
        linkedDocumentId: doc.id,
        counterpartyId: doc.counterparty?.id || null,
        ...(!isPayment && { warehouseId: doc.warehouse?.id || null }),
        items: isPayment ? [] : doc.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price,
        })),
        // For payment documents carry the parent's total so the new doc
        // reflects the correct amount to pay/receive (BUG-5 fix)
        ...(isPayment && { totalAmount: Number(doc.totalAmount) }),
        // Direction mapping: outgoing_shipment → incoming_payment (client pays us)
        //                    incoming_shipment  → outgoing_payment  (we pay supplier)
      };

      const res = await csrfFetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      const newDoc = await res.json();
      toast.success("Связанный документ создан");
      router.push(`/documents/${newDoc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreatingLinked(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Документ не найден</p>
        <Link href="/documents">
          <Button variant="outline" className="mt-4">К списку документов</Button>
        </Link>
      </div>
    );
  }

  const linkedOptions = LINKED_DOC_TYPES[doc.type] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/documents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={`${doc.typeName} ${doc.number}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/documents/${id}/print`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4 mr-1" />Печать
                </Link>
              </Button>
              {doc.status === "draft" && (
                <>
                  {doc.type === "inventory_count" && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleFillFromStock} disabled={fillingStock || fillingAll}>
                        <Database className="h-4 w-4 mr-1" />
                        {fillingStock ? "Заполнение..." : "Заполнить фактические остатки"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleFillAllProducts} disabled={fillingStock || fillingAll}>
                        <Plus className="h-4 w-4 mr-1" />
                        {fillingAll ? "Заполнение..." : "Заполнить все товары"}
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setAddItemOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />Добавить позицию
                  </Button>
                  <Button size="sm" onClick={handleConfirm}>
                    <Check className="h-4 w-4 mr-1" />Подтвердить
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-1" />Удалить
                  </Button>
                </>
              )}
              {doc.status === "confirmed" && (
                <>
                  <Button variant="destructive" size="sm" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-1" />Отменить
                  </Button>
                  {/* Reopen button for editable stock document types */}
                  {["inventory_count", "write_off", "stock_receipt"].includes(doc.type) && (
                    <Button variant="outline" size="sm" onClick={handleReopen} disabled={reopening}>
                      <Edit2 className="h-4 w-4 mr-1" />
                      {reopening ? "Открытие..." : "Редактировать"}
                    </Button>
                  )}
                  {/* Manual adjustment document creation for confirmed inventory count */}
                  {doc.type === "inventory_count" && (
                    <>
                      {doc.items.some((i) => (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) < 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateAdjustment("write_off")}
                          disabled={creatingLinkedAdj}
                        >
                          <MinusCircle className="h-4 w-4 mr-1" />
                          Создать списание ({doc.items.filter((i) => (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) < 0).length} поз.)
                        </Button>
                      )}
                      {doc.items.some((i) => (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) > 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateAdjustment("stock_receipt")}
                          disabled={creatingLinkedAdj}
                        >
                          <PlusCircle className="h-4 w-4 mr-1" />
                          Создать оприходование ({doc.items.filter((i) => (i.difference ?? (i.actualQty ?? 0) - (i.expectedQty ?? 0)) > 0).length} поз.)
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
              {/* Inventory count: quick navigation to auto-created adjustment docs */}
              {doc.type === "inventory_count" && doc.status === "confirmed" && doc.linkedFrom.length > 0 && (
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: doc.linkedFrom.map((linked) => ({
                      key: linked.id,
                      label: `${linked.typeName || linked.type} ${linked.number}`,
                      onClick: () => router.push(`/documents/${linked.id}`),
                    })) satisfies MenuProps["items"],
                  }}
                >
                  <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-1" />Док. коррекции
                  </Button>
                </Dropdown>
              )}
              {linkedOptions.length > 0 && (
                <Dropdown
                  trigger={["click"]}
                  disabled={creatingLinked}
                  menu={{
                    items: linkedOptions.map((opt) => ({
                      key: opt.type,
                      label: opt.label,
                      onClick: () => handleCreateLinkedDoc(opt.type),
                    })) satisfies MenuProps["items"],
                  }}
                >
                  <Button variant="outline" size="sm" disabled={creatingLinked}>
                    <Link2 className="h-4 w-4 mr-1" />
                    {creatingLinked ? "Создание..." : "Создать на основании"}
                  </Button>
                </Dropdown>
              )}
            </div>
          }
        />
      </div>

      {/* Linked Documents */}
      {(doc.linkedDocument || doc.linkedFrom.length > 0) && (
        <Card title={<span className="text-sm text-muted-foreground">Связанные документы</span>}>
          <div className="flex flex-wrap gap-2">
            {doc.linkedDocument && (
              <Link href={`/documents/${doc.linkedDocument.id}`}>
                <Tag className="cursor-pointer hover:bg-accent">
                  Основание: {doc.linkedDocument.typeName || doc.linkedDocument.type} {doc.linkedDocument.number}
                </Tag>
              </Link>
            )}
            {doc.linkedFrom.map((linked) => (
              <Link key={linked.id} href={`/documents/${linked.id}`}>
                <Tag className="cursor-pointer hover:bg-accent">
                  {linked.typeName || linked.type} {linked.number}
                </Tag>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Document Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={<span className="text-sm text-muted-foreground">Статус</span>}>
          <Tag color={STATUS_TAG_COLORS[doc.status] || "default"} className="text-sm">
            {doc.statusName}
          </Tag>
        </Card>
        <Card title={<span className="text-sm text-muted-foreground">Дата</span>}>
          <p className="font-medium">{formatDate(doc.date)}</p>
          <p className="text-xs text-muted-foreground">Создан: {formatDateTime(doc.createdAt)}{doc.createdBy ? ` (${doc.createdBy})` : ""}</p>
          {doc.confirmedAt && (
            <p className="text-xs text-muted-foreground">Подтверждён: {formatDateTime(doc.confirmedAt)}{doc.confirmedBy ? ` (${doc.confirmedBy})` : ""}</p>
          )}
        </Card>
        <Card title={<span className="text-sm text-muted-foreground">Сумма</span>}>
          <p className="text-xl font-bold">{formatRub(doc.totalAmount)}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {doc.warehouse && (
          <Card title={<span className="text-sm text-muted-foreground">Склад</span>}>
            <p className="font-medium">{doc.warehouse.name}</p>
          </Card>
        )}
        {doc.targetWarehouse && (
          <Card title={<span className="text-sm text-muted-foreground">Склад-получатель</span>}>
            <p className="font-medium">{doc.targetWarehouse.name}</p>
          </Card>
        )}
        {doc.counterparty && (
          <Card title={<span className="text-sm text-muted-foreground">Контрагент</span>}>
            <p className="font-medium">{doc.counterparty.name}</p>
          </Card>
        )}
      </div>

      {/* Items + Journal Tabs */}
      <Tabs
        defaultActiveKey="items"
        items={[
          {
            key: "items",
            label: `Позиции (${doc.items.length})`,
            children: (
              <Card>
                <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Товар</TableHead>
                        <TableHead>Артикул</TableHead>
                        <TableHead>Ед.</TableHead>
                        {doc.type === "inventory_count" ? (
                          <>
                            <TableHead className="text-right">По учёту</TableHead>
                            <TableHead className="text-right">Факт</TableHead>
                            <TableHead className="text-right">Отклонение</TableHead>
                          </>
                        ) : (
                          <TableHead className="text-right">Кол-во</TableHead>
                        )}
                        <TableHead className="text-right">Цена</TableHead>
                        {doc.type === "inventory_count" ? (
                          <>
                            <TableHead className="text-right">Сумма факта</TableHead>
                            <TableHead className="text-right">Сумма отклонения</TableHead>
                          </>
                        ) : (
                          <TableHead className="text-right">Сумма</TableHead>
                        )}
                        {doc.status === "draft" && <TableHead className="w-20" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doc.items.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={doc.type === "inventory_count" ? (doc.status === "draft" ? 10 : 9) : (doc.status === "draft" ? 8 : 7)}
                            className="text-center text-muted-foreground py-8"
                          >
                            {doc.type === "inventory_count" && doc.status === "draft"
                              ? "Нет позиций. Используйте «Заполнить» или добавьте позиции вручную"
                              : ["write_off", "stock_receipt"].includes(doc.type) && doc.status === "draft"
                              ? "Нет позиций. Нажмите «Добавить позицию» для добавления товаров"
                              : "Нет позиций"
                            }
                          </TableCell>
                        </TableRow>
                      ) : (
                        doc.items.map((item, i) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{item.product.name}</TableCell>
                            <TableCell className="text-muted-foreground">{item.product.sku || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{item.product.unit?.shortName || "—"}</TableCell>

                            {doc.type === "inventory_count" ? (
                              <>
                                {/* По учёту: expectedQty (read-only) */}
                                <TableCell className="text-right text-muted-foreground">
                                  {item.expectedQty ?? 0}
                                </TableCell>

                                {/* Факт: actualQty (editable in draft) */}
                                <TableCell className="text-right">
                                  {doc.status === "draft" ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      className="w-24 h-7 text-right text-sm"
                                      value={editingActualQty[i] ?? String(item.actualQty ?? 0)}
                                      onChange={(e) =>
                                        setEditingActualQty((prev) => ({ ...prev, [i]: e.target.value }))
                                      }
                                      onBlur={() => {
                                        const raw = editingActualQty[i];
                                        if (raw !== undefined) {
                                          handleUpdateActualQty(i, parseFloat(raw) || 0);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span>{item.actualQty ?? 0}</span>
                                  )}
                                </TableCell>

                                {/* Отклонение: computed from actualQty - expectedQty */}
                                <TableCell className="text-right">
                                  {(() => {
                                    const actual = doc.status === "draft" && editingActualQty[i] !== undefined
                                      ? (parseFloat(editingActualQty[i]) || 0)
                                      : (item.actualQty ?? 0);
                                    const diff = actual - (item.expectedQty ?? 0);
                                    return (
                                      <span
                                        className="font-medium"
                                        style={{
                                          color: diff < 0 ? "#ef4444" : diff > 0 ? "#22c55e" : undefined,
                                        }}
                                      >
                                        {diff > 0 ? "+" : ""}{diff % 1 === 0 ? diff : diff.toFixed(3)}
                                      </span>
                                    );
                                  })()}
                                </TableCell>
                              </>
                            ) : (
                              /* Standard quantity column for non-inventory docs */
                              <TableCell className="text-right">
                                {doc.status === "draft" ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-20 h-7 text-right text-sm"
                                    value={editingItems[i]?.quantity ?? String(item.quantity)}
                                    onChange={(e) => setEditingItems((prev) => ({ ...prev, [i]: { quantity: e.target.value, price: prev[i]?.price ?? String(item.price) } }))}
                                    onBlur={() => {
                                      const ed = editingItems[i];
                                      if (ed) handleUpdateItem(i, parseFloat(ed.quantity) || item.quantity, parseFloat(ed.price) || item.price);
                                    }}
                                  />
                                ) : item.quantity}
                              </TableCell>
                            )}

                            <TableCell className="text-right">
                              {doc.status === "draft" && doc.type !== "inventory_count" ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-28 h-7 text-right text-sm"
                                  value={editingItems[i]?.price ?? String(item.price)}
                                  onChange={(e) => setEditingItems((prev) => ({ ...prev, [i]: { quantity: prev[i]?.quantity ?? String(item.quantity), price: e.target.value } }))}
                                  onBlur={() => {
                                    const ed = editingItems[i];
                                    if (ed) handleUpdateItem(i, parseFloat(ed.quantity) || item.quantity, parseFloat(ed.price) || item.price);
                                  }}
                                />
                              ) : formatRub(item.price)}
                            </TableCell>
                            {doc.type === "inventory_count" ? (
                              <>
                                {/* Сумма факта = actualQty * price */}
                                <TableCell className="text-right font-medium">
                                  {(() => {
                                    const actual = doc.status === "draft" && editingActualQty[i] !== undefined
                                      ? (parseFloat(editingActualQty[i]) || 0)
                                      : (item.actualQty ?? 0);
                                    return formatRub(actual * Number(item.price));
                                  })()}
                                </TableCell>
                                {/* Сумма отклонения = |actualQty - expectedQty| * price */}
                                <TableCell className="text-right font-medium">
                                  {(() => {
                                    const actual = doc.status === "draft" && editingActualQty[i] !== undefined
                                      ? (parseFloat(editingActualQty[i]) || 0)
                                      : (item.actualQty ?? 0);
                                    const diff = Math.abs(actual - (item.expectedQty ?? 0));
                                    return (
                                      <span style={{ color: diff > 0 ? "#ef4444" : undefined }}>
                                        {formatRub(diff * Number(item.price))}
                                      </span>
                                    );
                                  })()}
                                </TableCell>
                              </>
                            ) : (
                              <TableCell className="text-right font-medium">
                                {formatRub(Number(item.price) * Number(item.quantity))}
                              </TableCell>
                            )}
                            {doc.status === "draft" && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(i)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
              </Card>
            ),
          },
          {
            key: "journal",
            label: (
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Проводки{journalEntries.length > 0 ? ` (${journalEntries.length})` : ""}
              </span>
            ),
            children: (
              <Card>
                  {journalLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
                  ) : journalEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Проводки отсутствуют. Документ ещё не проведён в журнал.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {journalEntries.map((entry) => (
                        <div key={entry.id}>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono text-sm font-medium">{entry.number}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                            {entry.description && <span className="text-xs text-muted-foreground">{entry.description}</span>}
                            {entry.isReversed && <span className="text-xs text-destructive font-medium">СТОРНО</span>}
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Счёт</TableHead>
                                <TableHead>Название</TableHead>
                                <TableHead className="text-right">Дебет</TableHead>
                                <TableHead className="text-right">Кредит</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.lines.map((line) => (
                                <TableRow key={line.id}>
                                  <TableCell className="font-mono text-sm">{line.accountCode}</TableCell>
                                  <TableCell className="text-sm">{line.accountName}</TableCell>
                                  <TableCell className="text-right text-sm">
                                    {line.debit > 0 ? formatRub(line.debit) : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {line.credit > 0 ? formatRub(line.credit) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  )}
              </Card>
            ),
          },
        ]}
      />

      {(doc.description || doc.notes) && (
        <div className="grid gap-4">
          {doc.description && (
            <Card title={<span className="text-sm text-muted-foreground">Описание</span>}>
              <p>{doc.description}</p>
            </Card>
          )}
          {doc.notes && (
            <Card title={<span className="text-sm text-muted-foreground">Заметки</span>}>
              <p>{doc.notes}</p>
            </Card>
          )}
        </div>
      )}

      {/* Add Item Dialog */}
      <Modal
        open={addItemOpen}
        onCancel={() => setAddItemOpen(false)}
        onOk={handleAddItem}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Добавление..." : "Добавить"}
        cancelText="Отмена"
        title="Добавить позицию"
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Товар *</Label>
            <Input
              placeholder="Поиск товара..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="mb-1"
            />
            <Select value={itemProductId} onValueChange={handleProductSelect}>
              <SelectTrigger><SelectValue placeholder="Выберите из списка" /></SelectTrigger>
              <SelectContent>
                {products.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {productSearch ? "Ничего не найдено" : "Начните вводить название..."}
                  </div>
                )}
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {doc?.type === "inventory_count" ? (
            /* Inventory count: show По учёту + Факт fields */
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>По учёту</Label>
                <Input
                  type="number"
                  readOnly
                  value={itemExpectedQty}
                  className="bg-muted cursor-default"
                />
              </div>
              <div className="grid gap-2">
                <Label>Фактическое кол-во</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Количество</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Цена {products.find(p => p.id === itemProductId)?.purchasePrice != null && doc && ["incoming_shipment","purchase_order","supplier_return","stock_receipt"].includes(doc.type) ? <span className="text-xs text-muted-foreground ml-1">(закупочная)</span> : products.find(p => p.id === itemProductId)?.salePrice != null && doc && ["outgoing_shipment","sales_order","customer_return"].includes(doc.type) ? <span className="text-xs text-muted-foreground ml-1">(продажная)</span> : null}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

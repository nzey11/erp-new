"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, X, Plus, Trash2, ArrowLeft, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatRub, formatDate, formatDateTime } from "@/lib/shared/utils";
import Link from "next/link";

interface DocumentItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
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
  confirmedAt: string | null;
  cancelledAt: string | null;
  warehouse: { id: string; name: string } | null;
  targetWarehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
  items: DocumentItem[];
  linkedDocument: { id: string; number: string; type: string; typeName?: string } | null;
  linkedFrom: { id: string; number: string; type: string; typeName?: string }[];
}

interface Product { id: string; name: string; sku: string | null }

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  confirmed: "default",
  cancelled: "destructive",
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

  useEffect(() => {
    fetch("/api/accounting/products?limit=100")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((data) => setProducts(Array.isArray(data.data) ? data.data : []));
  }, []);

  const handleConfirm = async () => {
    try {
      const res = await fetch(`/api/accounting/documents/${id}/confirm`, { method: "POST" });
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
      const res = await fetch(`/api/accounting/documents/${id}/cancel`, { method: "POST" });
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
      const res = await fetch(`/api/accounting/documents/${id}`, { method: "DELETE" });
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
      const currentItems = doc.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      }));
      currentItems.push({
        productId: itemProductId,
        quantity: parseFloat(itemQuantity) || 1,
        price: parseFloat(itemPrice) || 0,
      });

      const res = await fetch(`/api/accounting/documents/${id}`, {
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
      loadDoc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (removeIndex: number) => {
    if (!doc) return;
    const currentItems = doc.items
      .filter((_, i) => i !== removeIndex)
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      }));

    try {
      const res = await fetch(`/api/accounting/documents/${id}`, {
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
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      };

      const res = await fetch("/api/accounting/documents", {
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
              {doc.status === "draft" && (
                <>
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
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />Отменить
                </Button>
              )}
              {linkedOptions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={creatingLinked}>
                      <Link2 className="h-4 w-4 mr-1" />
                      {creatingLinked ? "Создание..." : "Создать на основании"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {linkedOptions.map((opt) => (
                      <DropdownMenuItem key={opt.type} onClick={() => handleCreateLinkedDoc(opt.type)}>
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        />
      </div>

      {/* Linked Documents */}
      {(doc.linkedDocument || doc.linkedFrom.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Связанные документы</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {doc.linkedDocument && (
              <Link href={`/documents/${doc.linkedDocument.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Основание: {doc.linkedDocument.typeName || doc.linkedDocument.type} {doc.linkedDocument.number}
                </Badge>
              </Link>
            )}
            {doc.linkedFrom.map((linked) => (
              <Link key={linked.id} href={`/documents/${linked.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  {linked.typeName || linked.type} {linked.number}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Document Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Статус</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={STATUS_COLORS[doc.status] || "outline"} className="text-sm">
              {doc.statusName}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Дата</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{formatDate(doc.date)}</p>
            {doc.confirmedAt && (
              <p className="text-xs text-muted-foreground">Подтверждён: {formatDateTime(doc.confirmedAt)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Сумма</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatRub(doc.totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {doc.warehouse && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Склад</CardTitle>
            </CardHeader>
            <CardContent><p className="font-medium">{doc.warehouse.name}</p></CardContent>
          </Card>
        )}
        {doc.targetWarehouse && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Склад-получатель</CardTitle>
            </CardHeader>
            <CardContent><p className="font-medium">{doc.targetWarehouse.name}</p></CardContent>
          </Card>
        )}
        {doc.counterparty && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Контрагент</CardTitle>
            </CardHeader>
            <CardContent><p className="font-medium">{doc.counterparty.name}</p></CardContent>
          </Card>
        )}
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Позиции ({doc.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Артикул</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                {doc.status === "draft" && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={doc.status === "draft" ? 7 : 6} className="text-center text-muted-foreground py-8">
                    Нет позиций
                  </TableCell>
                </TableRow>
              ) : (
                doc.items.map((item, i) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{item.product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.product.sku || "—"}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatRub(item.price)}</TableCell>
                    <TableCell className="text-right font-medium">{formatRub(item.total)}</TableCell>
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
        </CardContent>
      </Card>

      {doc.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Описание</CardTitle>
          </CardHeader>
          <CardContent><p>{doc.description}</p></CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить позицию</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Товар *</Label>
              <Select value={itemProductId} onValueChange={setItemProductId}>
                <SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <Label>Цена</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Отмена</Button>
            <Button onClick={handleAddItem} disabled={saving}>
              {saving ? "Добавление..." : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

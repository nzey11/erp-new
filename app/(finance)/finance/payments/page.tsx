"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Pencil, ChevronLeft, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

interface FinanceCategory {
  id: string;
  name: string;
  type: string;
}

interface Counterparty {
  id: string;
  name: string;
}

interface Payment {
  id: string;
  number: string;
  type: string;
  amount: number;
  paymentMethod: string;
  date: string;
  description: string | null;
  category: { id: string; name: string; type: string };
  counterparty: { id: string; name: string } | null;
  document: { id: string; number: string; type: string } | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  bank_transfer: "Перевод",
  card: "Карта",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [netCashFlow, setNetCashFlow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [counterpartyFilter, setCounterpartyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [form, setForm] = useState({
    type: "income",
    categoryId: "",
    counterpartyId: "none",
    amount: "",
    paymentMethod: "bank_transfer",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({
    categoryId: "",
    counterpartyId: "none",
    amount: "",
    paymentMethod: "bank_transfer",
    date: "",
    description: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (counterpartyFilter && counterpartyFilter !== "all") params.set("counterpartyId", counterpartyFilter);
      if (categoryFilter && categoryFilter !== "all") params.set("categoryId", categoryFilter);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/finance/payments?${params}`);
      const data = await res.json();
      setPayments(data.payments ?? []);
      setTotal(data.total ?? 0);
      setIncomeTotal(data.incomeTotal ?? 0);
      setExpenseTotal(data.expenseTotal ?? 0);
      setNetCashFlow(data.netCashFlow ?? 0);
    } catch {
      toast.error("Ошибка загрузки платежей");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFrom, dateTo, counterpartyFilter, categoryFilter, page]);

  useEffect(() => { load(); }, [load]);

  const loadFormData = async () => {
    const [catRes, cpRes] = await Promise.all([
      fetch("/api/finance/categories"),
      fetch("/api/accounting/counterparties"),
    ]);
    const catData = await catRes.json();
    const cpData = await cpRes.json();
    setCategories(catData.categories ?? []);
    setCounterparties(Array.isArray(cpData) ? cpData : (cpData.counterparties ?? cpData.data ?? []));
  };

  useEffect(() => { loadFormData(); }, []);

  const openCreate = () => {
    setForm({
      type: "income",
      categoryId: "",
      counterpartyId: "none",
      amount: "",
      paymentMethod: "bank_transfer",
      date: new Date().toISOString().split("T")[0],
      description: "",
    });
    loadFormData();
    setCreateOpen(true);
  };

  const openEdit = (payment: Payment) => {
    setEditingPayment(payment);
    setEditForm({
      categoryId: payment.category.id,
      counterpartyId: payment.counterparty?.id ?? "none",
      amount: String(payment.amount),
      paymentMethod: payment.paymentMethod,
      date: payment.date.split("T")[0],
      description: payment.description ?? "",
    });
    loadFormData();
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingPayment) return;
    if (!editForm.categoryId) { toast.error("Выберите статью"); return; }
    if (!editForm.amount || isNaN(Number(editForm.amount)) || Number(editForm.amount) <= 0) {
      toast.error("Укажите корректную сумму"); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/payments/${editingPayment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editForm.categoryId,
          counterpartyId: editForm.counterpartyId !== "none" ? editForm.counterpartyId : null,
          amount: Number(editForm.amount),
          paymentMethod: editForm.paymentMethod,
          date: editForm.date,
          description: editForm.description || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Платёж обновлён");
      setEditOpen(false);
      setEditingPayment(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const editCategories = categories.filter((c) => c.type === editingPayment?.type);
  const filteredCategories = categories.filter((c) => c.type === form.type);

  const handleCreate = async () => {
    if (!form.categoryId) { toast.error("Выберите статью"); return; }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error("Укажите корректную сумму"); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          categoryId: form.categoryId,
          counterpartyId: form.counterpartyId && form.counterpartyId !== "none" ? form.counterpartyId : null,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          date: form.date,
          description: form.description || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Платёж создан");
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (payment: Payment) => {
    setDeleteTarget(payment);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/finance/payments/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Платёж удалён");
      setDeleteOpen(false);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);


  return (
    <div className="space-y-6">
      <PageHeader
        title="Платежи"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Новый платёж
          </Button>
        }
      />

      {/* Summary — server-aggregated totals for the current filter */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Поступления</p>
          <p className="text-2xl font-bold text-green-600">{formatRub(incomeTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">за выбранный период</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Выплаты</p>
          <p className="text-2xl font-bold text-red-600">{formatRub(expenseTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">за выбранный период</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Чистый поток</p>
          <p className={`text-2xl font-bold ${netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatRub(netCashFlow)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">поступления − выплаты</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Тип</Label>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="income">Доходы</SelectItem>
              <SelectItem value="expense">Расходы</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Контрагент</Label>
          <Select value={counterpartyFilter} onValueChange={(v) => { setCounterpartyFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {counterparties.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Статья</Label>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">С</Label>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-36" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">По</Label>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-36" />
        </div>
        {(typeFilter !== "all" || counterpartyFilter !== "all" || categoryFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setTypeFilter("all"); setCounterpartyFilter("all"); setCategoryFilter("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>
            Сбросить
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : payments.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">Платежей нет</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Номер</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статья</TableHead>
                <TableHead>Контрагент</TableHead>
                <TableHead>Способ</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead>Документ</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.number}</TableCell>
                  <TableCell className="text-sm">{new Date(p.date).toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell>
                    {p.type === "income" ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Доход</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Расход</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{p.category.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.counterparty?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</TableCell>
                  <TableCell className={`text-right font-semibold ${p.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {p.type === "income" ? "+" : "-"}{formatRub(p.amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.document ? (
                      <Link
                        href={`/documents/${p.document.id}`}
                        className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                      >
                        {p.document.number}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {p.document ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-30"
                          disabled
                          title="Создан автоматически из документа — удаление недоступно"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => confirmDelete(p)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-2 border-t text-sm text-muted-foreground">
            <span>Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2">{page} / {totalPages}</span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Новый платёж</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Тип *</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v, categoryId: "" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Доход (поступление)</SelectItem>
                    <SelectItem value="expense">Расход (выплата)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Статья *</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите статью" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Сумма *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>Способ оплаты *</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Перевод</SelectItem>
                    <SelectItem value="cash">Наличные</SelectItem>
                    <SelectItem value="card">Карта</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <Select value={form.counterpartyId} onValueChange={(v) => setForm((f) => ({ ...f, counterpartyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбран</SelectItem>
                    {counterparties.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Дата *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Описание</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Необязательно"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Сохранение..." : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditingPayment(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Изменить платёж{editingPayment ? ` ${editingPayment.number}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {editingPayment && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Тип:</span>
                <Badge className={editingPayment.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {editingPayment.type === "income" ? "Доход" : "Расход"}
                </Badge>
                {editingPayment.document && (
                  <span className="text-xs">(автоматически создан по док. {editingPayment.document.number})</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Статья *</Label>
                <Select
                  value={editForm.categoryId}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, categoryId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите статью" /></SelectTrigger>
                  <SelectContent>
                    {editCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Сумма *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Способ оплаты *</Label>
                <Select value={editForm.paymentMethod} onValueChange={(v) => setEditForm((f) => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Перевод</SelectItem>
                    <SelectItem value="cash">Наличные</SelectItem>
                    <SelectItem value="card">Карта</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Дата *</Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <Select value={editForm.counterpartyId} onValueChange={(v) => setEditForm((f) => ({ ...f, counterpartyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбран</SelectItem>
                    {counterparties.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Описание</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Необязательно"
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditingPayment(null); }}>Отмена</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Удалить платёж?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Платёж <span className="font-mono font-semibold">{deleteTarget?.number}</span> на сумму{" "}
            <span className="font-semibold">{deleteTarget ? formatRub(deleteTarget.amount) : ""}</span> будет удалён безвозвратно.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteTarget(null); }}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

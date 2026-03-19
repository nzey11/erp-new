"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Tag, Table, type TableColumnsType, Modal, Select, Input, Typography, Button } from "antd";
import { Plus, Pencil, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";

interface FinanceCategory {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  isActive: boolean;
  order: number;
  defaultAccountCode?: string | null;
}

interface Account {
  id: string;
  code: string;
  name: string;
  category: string;
}

// Suggested accounts by category type
const INCOME_ACCOUNT_HINTS = ["90.1", "91.1"];
const EXPENSE_ACCOUNT_HINTS = ["44", "26", "20", "91.2", "70", "68", "66", "67", "94"];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FinanceCategory | null>(null);
  const [form, setForm] = useState({ name: "", type: "income", defaultAccountCode: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinanceCategory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, accRes] = await Promise.all([
        fetch("/api/finance/categories"),
        fetch("/api/accounting/accounts"),
      ]);
      const catData = await catRes.json();
      // API returns a flat array directly
      const accList: Account[] = accRes.ok ? await accRes.json() : [];
      setCategories(catData.categories ?? []);
      setAccounts(Array.isArray(accList) ? accList : []);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Введите название"); return; }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/finance/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          defaultAccountCode: form.defaultAccountCode || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Статья добавлена");
      setCreateOpen(false);
      setForm({ name: "", type: "income", defaultAccountCode: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        defaultAccountCode: form.defaultAccountCode || null,
      };
      if (!editTarget.isSystem) body.name = form.name;

      const res = await csrfFetch(`/api/finance/categories/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Статья обновлена");
      setEditOpen(false);
      setEditTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await csrfFetch(`/api/finance/categories/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Статья удалена");
      setDeleteOpen(false);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
  
  const confirmDelete = (cat: FinanceCategory) => {
    setDeleteTarget(cat);
    setDeleteOpen(true);
  };

  const openEdit = (cat: FinanceCategory) => {
    setEditTarget(cat);
    setForm({ name: cat.name, type: cat.type, defaultAccountCode: cat.defaultAccountCode ?? "" });
    setEditOpen(true);
  };

  const getAccountLabel = (code: string | null | undefined) => {
    if (!code) return null;
    const acc = accounts.find((a) => a.code === code);
    return acc ? `${acc.code} — ${acc.name}` : code;
  };

  const filteredAccounts = (type: string) => {
    const hints = type === "income" ? INCOME_ACCOUNT_HINTS : EXPENSE_ACCOUNT_HINTS;
    const hinted = accounts.filter((a) => hints.includes(a.code));
    const rest = accounts.filter((a) => !hints.includes(a.code));
    return [...hinted, ...rest];
  };

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getCategoryColumns = (_colorClass: string): TableColumnsType<FinanceCategory> => [
    { key: "name", dataIndex: "name", title: "Название" },
    {
      key: "account",
      title: "Счёт по умолчанию",
      render: (_, cat) => (
        <span className="font-mono text-sm text-muted-foreground">
          {getAccountLabel(cat.defaultAccountCode) ?? (
            <span className="text-xs italic text-muted-foreground/60">не задан</span>
          )}
        </span>
      ),
    },
    {
      key: "type",
      title: "Тип",
      width: 96,
      render: (_, cat) =>
        cat.isSystem ? (
          <Tag color="default" className="text-xs">Системная</Tag>
        ) : (
          <Tag className="text-xs">Своя</Tag>
        ),
    },
    {
      key: "actions",
      title: "",
      width: 64,
      render: (_, cat) => (
        <div className="flex gap-1">
          <Button
            type="text"
            icon={<Pencil className="h-3 w-3" />}
            className="h-7 w-7"
            onClick={() => openEdit(cat)}
            title="Назначить счёт"
          />
          {!cat.isSystem && (
            <Button
              type="text"
              danger
              icon={<Trash2 className="h-3 w-3" />}
              className="h-7 w-7"
              onClick={() => confirmDelete(cat)}
            />
          )}
        </div>
      ),
    },
  ];

  const CategoryTable = ({ items, title, colorClass }: { items: FinanceCategory[]; title: string; colorClass: string }) => (
    <div>
      <h2 className={`text-base font-semibold mb-3 ${colorClass}`}>{title}</h2>
      <Table
        columns={getCategoryColumns(colorClass)}
        dataSource={items}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: "Нет статей" }}
      />
    </div>
  );

  const AccountSelect = ({ value, onChange, type }: { value: string; onChange: (v: string) => void; type: string }) => (
    <Select
      value={value || "__none__"}
      onChange={(v) => onChange(v === "__none__" ? "" : v)}
      placeholder="Не задан (авто)"
      style={{ width: "100%" }}
      options={[
        { value: "__none__", label: "Не задан (авто)" },
        ...filteredAccounts(type).map((acc) => ({
          value: acc.code,
          label: (
            <span>
              <span className="font-mono text-xs mr-2">{acc.code}</span>
              <span className="text-muted-foreground">{acc.name}</span>
            </span>
          ),
        })),
      ]}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Статьи доходов и расходов"
        description="Привяжите каждую статью к счёту плана счетов для автоматических проводок"
        actions={
          <Button type="primary" onClick={() => { setForm({ name: "", type: "income", defaultAccountCode: "" }); setCreateOpen(true); }} icon={<Plus className="h-4 w-4" />}>
            Добавить статью
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <CategoryTable items={income} title="Статьи доходов" colorClass="text-green-700" />
          <CategoryTable items={expense} title="Статьи расходов" colorClass="text-red-700" />
        </div>
      )}

      {/* Create Dialog */}
      <Modal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Добавить"}
        cancelText="Отмена"
        title="Новая статья"
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Typography.Text strong>Тип *</Typography.Text>
            <Select
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v, defaultAccountCode: "" }))}
              style={{ width: "100%" }}
              options={[
                { value: "income", label: "Доход" },
                { value: "expense", label: "Расход" },
              ]}
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Название *</Typography.Text>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Например: Маркетинг"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Счёт по умолчанию</Typography.Text>
            <p className="text-xs text-muted-foreground">
              При создании платежа с этой статьёй будет автоматически сформирована проводка на указанный счёт.
            </p>
            <AccountSelect value={form.defaultAccountCode} onChange={(v) => setForm((f) => ({ ...f, defaultAccountCode: v }))} type={form.type} />
          </div>
        </div>
      </Modal>

      {/* Edit Dialog */}
      <Modal
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEdit}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editTarget?.isSystem ? "Настроить счёт" : "Редактировать статью"}
      >
        <div className="grid gap-4 py-4">
          {!editTarget?.isSystem && (
            <div className="grid gap-2">
              <Typography.Text strong>Название *</Typography.Text>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleEdit()}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Typography.Text strong>Счёт по умолчанию</Typography.Text>
            <p className="text-xs text-muted-foreground">
              {editTarget?.type === "income"
                ? "Типичные счета: 90.1 (выручка), 91.1 (прочие доходы)"
                : "Типичные счета: 44 (расходы на продажи), 26 (общехозяйственные), 91.2 (прочие расходы)"}
            </p>
            <AccountSelect
              value={form.defaultAccountCode}
              onChange={(v) => setForm((f) => ({ ...f, defaultAccountCode: v }))}
              type={editTarget?.type ?? "expense"}
            />
          </div>
        </div>
      </Modal>
      {/* Delete Confirmation Dialog */}
      <Modal
        open={deleteOpen}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        onOk={handleDelete}
        okButtonProps={{ danger: true }}
        okText="Удалить"
        cancelText="Отмена"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Удалить статью?
          </span>
        }
      >
        <p className="text-sm text-muted-foreground py-2">
          Статья <span className="font-semibold">&ldquo;{deleteTarget?.name}&rdquo;</span> будет удалена.
          Платежи, связанные с ней, останутся.
        </p>
      </Modal>
    </div>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Divider } from "antd";
import { toast } from "sonner";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { csrfFetch } from "@/lib/client/csrf";
import { ArrowLeft, Pencil, X, Check, UserX, UserCheck } from "lucide-react";

interface CounterpartyInteraction {
  id: string;
  type: string;
  subject: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface CounterpartyDetail {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  bankAccount: string | null;
  bankName: string | null;
  bik: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  calculatedBalance: number | null;
  interactions: CounterpartyInteraction[];
}

const TYPE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель/Поставщик",
};

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  call: "Звонок",
  email: "Email",
  meeting: "Встреча",
  note: "Заметка",
};

type FormState = {
  type: string;
  name: string;
  legalName: string;
  inn: string;
  kpp: string;
  bankAccount: string;
  bankName: string;
  bik: string;
  address: string;
  phone: string;
  email: string;
  contactPerson: string;
  notes: string;
};

const emptyForm: FormState = {
  type: "customer",
  name: "",
  legalName: "",
  inn: "",
  kpp: "",
  bankAccount: "",
  bankName: "",
  bik: "",
  address: "",
  phone: "",
  email: "",
  contactPerson: "",
  notes: "",
};

export default function CounterpartyDetailPageWrapper() {
  return (
    <Suspense fallback={<div className="h-64 bg-muted rounded animate-pulse" />}>
      <CounterpartyDetailPage />
    </Suspense>
  );
}

function CounterpartyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  const isNew = id === "new";
  const redirectTo = searchParams.get("redirect");

  const [counterparty, setCounterparty] = useState<CounterpartyDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const setField = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    fetch(`/api/accounting/counterparties/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { toast.error(data.error); router.push("/counterparties"); return; }
        setCounterparty(data);
        setForm({
          type: data.type,
          name: data.name,
          legalName: data.legalName || "",
          inn: data.inn || "",
          kpp: data.kpp || "",
          bankAccount: data.bankAccount || "",
          bankName: data.bankName || "",
          bik: data.bik || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          contactPerson: data.contactPerson || "",
          notes: data.notes || "",
        });
      })
      .finally(() => setLoading(false));
  }, [id, isNew, router]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Название обязательно"); return; }
    setSaving(true);
    try {
      const res = isNew
        ? await csrfFetch("/api/accounting/counterparties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        : await csrfFetch(`/api/accounting/counterparties/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });

      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      const saved = await res.json();
      toast.success(isNew ? "Контрагент создан" : "Изменения сохранены");

      if (isNew) {
        if (redirectTo === "purchases") {
          router.push("/purchases");
        } else {
          router.push(`/counterparties/${saved.id}`);
        }
      } else {
        setCounterparty((prev) => prev ? { ...prev, ...saved } : null);
        setEditing(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!counterparty) return;
    try {
      const res = await csrfFetch(`/api/accounting/counterparties/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !counterparty.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCounterparty((prev) => prev ? { ...prev, isActive: !prev.isActive } : null);
      toast.success(counterparty.isActive ? "Контрагент деактивирован" : "Контрагент активирован");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleCancelEdit = () => {
    if (isNew) { router.push("/counterparties"); return; }
    if (counterparty) {
      setForm({
        type: counterparty.type,
        name: counterparty.name,
        legalName: counterparty.legalName || "",
        inn: counterparty.inn || "",
        kpp: counterparty.kpp || "",
        bankAccount: counterparty.bankAccount || "",
        bankName: counterparty.bankName || "",
        bik: counterparty.bik || "",
        address: counterparty.address || "",
        phone: counterparty.phone || "",
        email: counterparty.email || "",
        contactPerson: counterparty.contactPerson || "",
        notes: counterparty.notes || "",
      });
    }
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const title = isNew ? "Новый контрагент" : (counterparty?.name || "Контрагент");

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/counterparties" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Контрагенты
      </Link>

      <PageHeader
        title={title}
        actions={
          <div className="flex items-center gap-2">
            {!isNew && !editing && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Редактировать
                </Button>
                <Button
                  variant="outline"
                  onClick={handleToggleActive}
                  className={counterparty?.isActive ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                >
                  {counterparty?.isActive
                    ? <><UserX className="h-4 w-4 mr-2" />Деактивировать</>
                    : <><UserCheck className="h-4 w-4 mr-2" />Активировать</>}
                </Button>
              </>
            )}
            {editing && (
              <>
                <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Отмена
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Check className="h-4 w-4 mr-2" />
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Status badge */}
      {!isNew && counterparty && (
        <div className="flex items-center gap-2">
          <Badge variant={counterparty.isActive ? "default" : "secondary"}>
            {counterparty.isActive ? "Активен" : "Неактивен"}
          </Badge>
          <Badge variant="outline">{TYPE_LABELS[counterparty.type] || counterparty.type}</Badge>
          <span className="text-sm text-muted-foreground">
            Создан {formatDate(counterparty.createdAt)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main info + bank */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main info */}
          <div className="border rounded-lg p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Основная информация</h3>

            {editing ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Тип</Label>
                  <Select value={form.type} onValueChange={(v) => setField("type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Покупатель</SelectItem>
                      <SelectItem value="supplier">Поставщик</SelectItem>
                      <SelectItem value="both">Покупатель/Поставщик</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Название *</Label>
                  <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Название контрагента" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Юридическое название</Label>
                    <Input value={form.legalName} onChange={(e) => setField("legalName", e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Адрес</Label>
                    <Input value={form.address} onChange={(e) => setField("address", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>ИНН</Label>
                    <Input value={form.inn} onChange={(e) => setField("inn", e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>КПП</Label>
                    <Input value={form.kpp} onChange={(e) => setField("kpp", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Телефон</Label>
                    <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setField("email", e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Контактное лицо</Label>
                  <Input value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Заметки</Label>
                  <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} />
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoRow label="Название" value={counterparty?.name} />
                <InfoRow label="Юридическое название" value={counterparty?.legalName} />
                <InfoRow label="ИНН" value={counterparty?.inn} />
                <InfoRow label="КПП" value={counterparty?.kpp} />
                <InfoRow label="Телефон" value={counterparty?.phone} />
                <InfoRow label="Email" value={counterparty?.email} />
                <InfoRow label="Контактное лицо" value={counterparty?.contactPerson} />
                <InfoRow label="Адрес" value={counterparty?.address} className="col-span-2" />
                {counterparty?.notes && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground mb-1">Заметки</dt>
                    <dd className="whitespace-pre-wrap">{counterparty.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Bank */}
          <div className="border rounded-lg p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Банковские реквизиты</h3>
            {editing ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Расчётный счёт</Label>
                  <Input value={form.bankAccount} onChange={(e) => setField("bankAccount", e.target.value)} placeholder="40702810..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Банк</Label>
                    <Input value={form.bankName} onChange={(e) => setField("bankName", e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>БИК</Label>
                    <Input value={form.bik} onChange={(e) => setField("bik", e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoRow label="Расчётный счёт" value={counterparty?.bankAccount} className="col-span-2" />
                <InfoRow label="Банк" value={counterparty?.bankName} />
                <InfoRow label="БИК" value={counterparty?.bik} />
              </dl>
            )}
          </div>
        </div>

        {/* Right: Balance + interactions */}
        <div className="space-y-6">
          {/* Balance */}
          {!isNew && (
            <div className="border rounded-lg p-5 space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Взаиморасчёты</h3>
              <div className="text-2xl font-bold">
                {counterparty?.calculatedBalance !== null && counterparty?.calculatedBalance !== undefined ? (
                  <span className={counterparty.calculatedBalance >= 0 ? "text-green-600" : "text-red-600"}>
                    {formatRub(counterparty.calculatedBalance)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {counterparty?.calculatedBalance !== null && counterparty?.calculatedBalance !== undefined
                  ? counterparty.calculatedBalance >= 0
                    ? "Контрагент должен нам"
                    : "Мы должны контрагенту"
                  : "Нет данных"}
              </p>
            </div>
          )}

          {/* Interactions */}
          {!isNew && (
            <div className="border rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                История взаимодействий
              </h3>
              {!counterparty?.interactions?.length ? (
                <p className="text-sm text-muted-foreground">Взаимодействий нет</p>
              ) : (
                <div className="space-y-3">
                  {counterparty.interactions.map((item) => (
                    <div key={item.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-xs">
                          {INTERACTION_TYPE_LABELS[item.type] || item.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                      {item.subject && <p className="mt-1 font-medium">{item.subject}</p>}
                      {item.description && <p className="text-muted-foreground">{item.description}</p>}
                      <Divider className="mt-3" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium mt-0.5">{value || "—"}</dd>
    </div>
  );
}

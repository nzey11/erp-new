"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, UserPlus, Save, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  viewer: "Наблюдатель",
};

interface CompanyForm {
  name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  fiscalYearStartMonth: string;
}

export default function SettingsPage() {
  const grid = useDataGrid<User>({
    endpoint: "/api/accounting/users",
    enablePagination: false,
    enableSearch: false,
    responseAdapter: (json) => ({ data: Array.isArray(json) ? json as User[] : [], total: 0 }),
  });

  // Company settings
  const [companyForm, setCompanyForm] = useState<CompanyForm>({ name: "", inn: "", kpp: "", ogrn: "", fiscalYearStartMonth: "1" });
  const [savingCompany, setSavingCompany] = useState(false);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/settings/company");
      if (res.ok) {
        const data = await res.json();
        setCompanyForm({
          name: data.name || "",
          inn: data.inn || "",
          kpp: data.kpp || "",
          ogrn: data.ogrn || "",
          fiscalYearStartMonth: String(data.fiscalYearStartMonth || 1),
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  const saveCompany = async () => {
    if (!companyForm.name) { toast.error("Название обязательно"); return; }
    setSavingCompany(true);
    try {
      const res = await fetch("/api/accounting/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...companyForm, fiscalYearStartMonth: Number(companyForm.fiscalYearStartMonth) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success("Реквизиты сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingCompany(false);
    }
  };

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: "", password: "", email: "", role: "viewer" });
  const [savingUser, setSavingUser] = useState(false);

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({ username: "", password: "", email: "", role: "viewer" });
    setUserDialogOpen(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({ username: user.username, password: "", email: user.email || "", role: user.role });
    setUserDialogOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.username || (!editingUser && !userForm.password)) {
      toast.error("Логин и пароль обязательны");
      return;
    }
    setSavingUser(true);
    try {
      const body = {
        username: userForm.username,
        ...(userForm.password && { password: userForm.password }),
        email: userForm.email || null,
        role: userForm.role,
      };
      const res = editingUser
        ? await fetch(`/api/accounting/users/${editingUser.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/accounting/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
      toast.success(editingUser ? "Пользователь обновлён" : "Пользователь создан");
      setUserDialogOpen(false);
      grid.mutate.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingUser(false);
    }
  };

  const columns: DataGridColumn<User>[] = [
    {
      accessorKey: "username",
      header: "Логин",
      size: 180,
      meta: { canHide: false },
      cell: ({ row }) => <span className="font-medium">{row.original.username}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      size: 220,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email || "—"}</span>,
    },
    {
      accessorKey: "role",
      header: "Роль",
      size: 150,
      cell: ({ row }) => (
        <Badge variant="outline">{ROLE_LABELS[row.original.role] || row.original.role}</Badge>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      size: 120,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? "Активен" : "Неактивен"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 50,
      enableResizing: false,
      meta: { canHide: false },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditUser(row.original); }}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Настройки" description="Управление пользователями и системой" />

      {/* Company Settings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Реквизиты компании
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Название *</Label>
              <Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} placeholder="ООО Моя компания" />
            </div>
            <div className="grid gap-2">
              <Label>ИНН</Label>
              <Input value={companyForm.inn} onChange={(e) => setCompanyForm({ ...companyForm, inn: e.target.value })} placeholder="1234567890" />
            </div>
            <div className="grid gap-2">
              <Label>КПП</Label>
              <Input value={companyForm.kpp} onChange={(e) => setCompanyForm({ ...companyForm, kpp: e.target.value })} placeholder="123456789" />
            </div>
            <div className="grid gap-2">
              <Label>ОГРН</Label>
              <Input value={companyForm.ogrn} onChange={(e) => setCompanyForm({ ...companyForm, ogrn: e.target.value })} placeholder="1234567890123" />
            </div>
            <div className="grid gap-2">
              <Label>Начало фискального года (месяц)</Label>
              <Select value={companyForm.fiscalYearStartMonth} onValueChange={(v) => setCompanyForm({ ...companyForm, fiscalYearStartMonth: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    ["Январь", "1"], ["Февраль", "2"], ["Март", "3"], ["Апрель", "4"],
                    ["Май", "5"], ["Июнь", "6"], ["Июль", "7"], ["Август", "8"],
                    ["Сентябрь", "9"], ["Октябрь", "10"], ["Ноябрь", "11"], ["Декабрь", "12"],
                  ].map(([label, value]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveCompany} disabled={savingCompany} size="sm">
              <Save className="h-4 w-4 mr-2" />
              {savingCompany ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Пользователи ({grid.data.length})</CardTitle>
          <Button size="sm" onClick={openCreateUser}>
            <UserPlus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          <DataGrid
            {...grid.gridProps}
            columns={columns}
            emptyMessage="Нет пользователей"
            persistenceKey="settings-users"
            stickyHeader={false}
          />
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Редактировать пользователя" : "Новый пользователь"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Логин *</Label>
              <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>{editingUser ? "Новый пароль (оставьте пустым)" : "Пароль *"}</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Роль</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                  <SelectItem value="accountant">Бухгалтер</SelectItem>
                  <SelectItem value="viewer">Наблюдатель</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveUser} disabled={savingUser}>{savingUser ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

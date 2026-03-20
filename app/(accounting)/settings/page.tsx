"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "antd";
import { Tag, Card, Modal, Select, Input, Typography, App } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import Link from "next/link";
import { Pencil, UserPlus, Save, Building2, Warehouse, Trash2 } from "lucide-react";
import { Alert } from "antd";

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

function CleanDataButton() {
  const [loading, setLoading] = useState(false)
  const { message } = App.useApp()
  const [modal, modalContextHolder] = Modal.useModal()

  const handleClean = () => {
    modal.confirm({
      title: 'Очистить тестовые данные?',
      content: 'Будут удалены все документы, платежи и движения склада. Справочники останутся. Это действие необратимо.',
      okText: 'Очистить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        setLoading(true)
        try {
          const res = await csrfFetch('/api/dev/clean-data', { method: 'POST' })
          if (res.ok) {
            message.success('Данные очищены')
            window.location.reload()
          } else {
            const data = await res.json()
            message.error(data.error || 'Ошибка')
          }
        } catch (e) {
          message.error('Ошибка запроса')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  return (
    <>
      {modalContextHolder}
      <Button danger loading={loading} onClick={handleClean}>
        Очистить тестовые данные
      </Button>
    </>
  )
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
      const res = await csrfFetch("/api/accounting/settings/company", {
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
        ? await csrfFetch(`/api/accounting/users/${editingUser.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await csrfFetch("/api/accounting/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

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

  const columns: ERPColumn<User>[] = [
    {
      key: "username",
      dataIndex: "username",
      title: "Логин",
      width: 180,
      render: (_, row) => <span className="font-medium">{row.username}</span>,
    },
    {
      key: "email",
      dataIndex: "email",
      title: "Email",
      width: 220,
      render: (_, row) => <span className="text-muted-foreground">{row.email || "—"}</span>,
    },
    {
      key: "role",
      dataIndex: "role",
      title: "Роль",
      width: 150,
      render: (_, row) => (
        <Tag>{ROLE_LABELS[row.role] || row.role}</Tag>
      ),
    },
    {
      key: "isActive",
      dataIndex: "isActive",
      title: "Статус",
      width: 120,
      render: (_, row) => (
        <Tag color={row.isActive ? "blue" : "default"}>
          {row.isActive ? "Активен" : "Неактивен"}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: "",
      width: 50,
      align: "center",
      render: (_, row) => (
        <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); openEditUser(row); }} icon={<Pencil className="h-4 w-4" />} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Настройки" description="Управление пользователями и системой" />

      {/* Company Settings */}
      <Card title={
        <span className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Реквизиты компании
        </span>
      }>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Typography.Text strong>Название *</Typography.Text>
              <Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} placeholder="ООО Моя компания" />
            </div>
            <div className="grid gap-2">
              <Typography.Text strong>ИНН</Typography.Text>
              <Input value={companyForm.inn} onChange={(e) => setCompanyForm({ ...companyForm, inn: e.target.value })} placeholder="1234567890" />
            </div>
            <div className="grid gap-2">
              <Typography.Text strong>КПП</Typography.Text>
              <Input value={companyForm.kpp} onChange={(e) => setCompanyForm({ ...companyForm, kpp: e.target.value })} placeholder="123456789" />
            </div>
            <div className="grid gap-2">
              <Typography.Text strong>ОГРН</Typography.Text>
              <Input value={companyForm.ogrn} onChange={(e) => setCompanyForm({ ...companyForm, ogrn: e.target.value })} placeholder="1234567890123" />
            </div>
            <div className="grid gap-2">
              <Typography.Text strong>Начало фискального года (месяц)</Typography.Text>
              <Select
              value={companyForm.fiscalYearStartMonth}
              onChange={(v: string) => setCompanyForm({ ...companyForm, fiscalYearStartMonth: v })}
              style={{ width: "100%" }}
              options={[
                { value: "1", label: "Январь" },
                { value: "2", label: "Февраль" },
                { value: "3", label: "Март" },
                { value: "4", label: "Апрель" },
                { value: "5", label: "Май" },
                { value: "6", label: "Июнь" },
                { value: "7", label: "Июль" },
                { value: "8", label: "Август" },
                { value: "9", label: "Сентябрь" },
                { value: "10", label: "Октябрь" },
                { value: "11", label: "Ноябрь" },
                { value: "12", label: "Декабрь" },
              ]}
            />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveCompany} disabled={savingCompany} size="small">
              <Save className="h-4 w-4 mr-2" />
              {savingCompany ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
      </Card>

      <Card title={
        <span className="flex items-center gap-2">
          <Warehouse className="h-5 w-5" />
          Склады
        </span>
      } extra={
        <Link href="/warehouses">
          <Button size="small" variant="outlined">
            Управлять складами
          </Button>
        </Link>
      }>
        <p className="text-sm text-muted-foreground">
          Создание, редактирование и деактивация складов организации.
          Склады используются во всех складских операциях, при создании документов и в отчётах об остатках.
        </p>
      </Card>

      <Card title={<span>Пользователи ({grid.data.length})</span>} extra={
        <Button size="small" onClick={openCreateUser} icon={<UserPlus className="h-4 w-4" />}>
          Добавить
        </Button>
      }>
        <ERPTable
          data={grid.data}
          columns={columns}
          loading={grid.loading}
          emptyText="Нет пользователей"
          size="small"
        />
      </Card>

      {/* Dev Tools - Only visible in development */}
      {process.env.NODE_ENV !== 'production' && (
        <Card
          title={
            <span className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Dev Tools
            </span>
          }
        >
          <Alert
            type="warning"
            title="Только для разработки"
            description="Эти инструменты доступны только в development окружении и предназначены для упрощения ручного тестирования."
            className="mb-4"
          />
          <CleanDataButton />
        </Card>
      )}

      {/* User Dialog */}
      <Modal
        open={userDialogOpen}
        onCancel={() => setUserDialogOpen(false)}
        onOk={saveUser}
        okButtonProps={{ disabled: savingUser, loading: savingUser }}
        okText={savingUser ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingUser ? "Редактировать пользователя" : "Новый пользователь"}
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Typography.Text strong>Логин *</Typography.Text>
            <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>{editingUser ? "Новый пароль (оставьте пустым)" : "Пароль *"}</Typography.Text>
            <Input.Password value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Email</Typography.Text>
            <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Typography.Text strong>Роль</Typography.Text>
            <Select
              value={userForm.role}
              onChange={(v: string) => setUserForm({ ...userForm, role: v })}
              style={{ width: "100%" }}
              options={[
                { value: "admin", label: "Администратор" },
                { value: "manager", label: "Менеджер" },
                { value: "accountant", label: "Бухгалтер" },
                { value: "viewer", label: "Наблюдатель" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

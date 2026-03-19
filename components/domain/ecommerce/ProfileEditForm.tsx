"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "antd";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

interface ProfileEditFormProps {
  customer: {
    id: string;
    name: string | null;
    telegramUsername: string | null;
    email: string | null;
    phone: string | null;
  };
  onUpdate: (updated: ProfileEditFormProps["customer"]) => void;
}

export function ProfileEditForm({ customer, onUpdate }: ProfileEditFormProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Укажите имя");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/customer/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data);
        setEditing(false);
        toast.success("Профиль обновлён");
      } else {
        const err = await res.json();
        toast.error(err.error || "Не удалось обновить профиль");
      }
    } catch {
      toast.error("Не удалось обновить профиль");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(customer.name || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setEditing(false);
  };

  const displayName = customer.name || customer.telegramUsername || "Покупатель";

  if (!editing) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Контактная информация</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Редактировать
          </Button>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Имя:</span>
            <span className="font-medium">{displayName}</span>
          </div>
          {customer.telegramUsername && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Telegram:</span>
              <span className="font-medium">@{customer.telegramUsername}</span>
            </div>
          )}
          {customer.email && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{customer.email}</span>
            </div>
          )}
          {customer.phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Телефон:</span>
              <span className="font-medium">{customer.phone}</span>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Редактирование профиля</h2>
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="profile-name">Имя *</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-phone">Телефон</Label>
          <Input
            id="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (900) 123-45-67"
            type="tel"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            type="email"
          />
        </div>
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Отмена
          </Button>
        </div>
      </div>
    </Card>
  );
}

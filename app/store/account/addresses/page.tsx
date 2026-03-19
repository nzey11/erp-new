"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "antd";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "antd";
import { toast } from "sonner";

type Address = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apartment: string | null;
  postalCode: string | null;
  isDefault: boolean;
};

export default function AddressesPage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState({
    label: "",
    recipientName: "",
    phone: "",
    city: "",
    street: "",
    building: "",
    apartment: "",
    postalCode: "",
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ecommerce/addresses");
      if (res.ok) {
        const data = await res.json();
        setAddresses(data.addresses || []);
      } else if (res.status === 401) {
        router.push("/store/register");
      } else {
        toast.error("Не удалось загрузить адреса");
      }
    } catch (error) {
      console.error("Failed to fetch addresses:", error);
      toast.error("Не удалось загрузить адреса");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const openCreateDialog = () => {
    setEditingAddress(null);
    setFormData({
      label: "Дом",
      recipientName: "",
      phone: "",
      city: "",
      street: "",
      building: "",
      apartment: "",
      postalCode: "",
      isDefault: addresses.length === 0,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (address: Address) => {
    setEditingAddress(address);
    setFormData({
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      city: address.city,
      street: address.street,
      building: address.building,
      apartment: address.apartment || "",
      postalCode: address.postalCode || "",
      isDefault: address.isDefault,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.recipientName || !formData.phone || !formData.city || !formData.street || !formData.building) {
      toast.error("Заполните обязательные поля");
      return;
    }

    setSaving(true);
    try {
      const method = editingAddress ? "PUT" : "POST";
      const body = editingAddress ? { id: editingAddress.id, ...formData } : formData;

      const res = await fetch("/api/ecommerce/addresses", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingAddress ? "Адрес обновлён" : "Адрес добавлен");
        setDialogOpen(false);
        fetchAddresses();
      } else {
        const error = await res.json();
        toast.error(error.error || "Не удалось сохранить адрес");
      }
    } catch (error) {
      console.error("Failed to save address:", error);
      toast.error("Не удалось сохранить адрес");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить этот адрес?")) return;

    try {
      const res = await fetch(`/api/ecommerce/addresses?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Адрес удалён");
        fetchAddresses();
      } else {
        toast.error("Не удалось удалить адрес");
      }
    } catch (error) {
      console.error("Failed to delete address:", error);
      toast.error("Не удалось удалить адрес");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="h-24 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/store/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" />
          Назад в кабинет
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Адреса доставки</h1>
            <p className="text-muted-foreground">
              {addresses.length === 0 ? "У вас пока нет сохранённых адресов" : `Сохранено адресов: ${addresses.length}`}
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить адрес
          </Button>
        </div>
      </div>

      {/* Addresses List */}
      {addresses.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Нет сохранённых адресов</h2>
          <p className="text-muted-foreground mb-6">
            Добавьте адрес доставки для быстрого оформления заказов
          </p>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить адрес
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {addresses.map((address) => (
            <Card key={address.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">{address.label}</h3>
                    {address.isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                        <Check className="h-3 w-3" />
                        По умолчанию
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {address.recipientName}, {address.phone}
                    </p>
                    <p>
                      г. {address.city}, ул. {address.street}, д. {address.building}
                      {address.apartment && `, кв. ${address.apartment}`}
                    </p>
                    {address.postalCode && <p>Индекс: {address.postalCode}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEditDialog(address)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(address.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Modal
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onOk={handleSave}
        okButtonProps={{ disabled: saving, loading: saving }}
        okText={saving ? "Сохранение..." : "Сохранить"}
        cancelText="Отмена"
        title={editingAddress ? "Редактировать адрес" : "Добавить адрес"}
      >
        <div className="space-y-4">
            <div>
              <Label htmlFor="label">Название адреса *</Label>
              <Input
                id="label"
                placeholder="Дом, Работа, и т.д."
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="recipientName">Получатель *</Label>
              <Input
                id="recipientName"
                placeholder="ФИО"
                value={formData.recipientName}
                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Телефон *</Label>
              <Input
                id="phone"
                placeholder="+7 (999) 123-45-67"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">Город *</Label>
              <Input
                id="city"
                placeholder="Москва"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="street">Улица *</Label>
              <Input
                id="street"
                placeholder="Ленина"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="building">Дом *</Label>
                <Input
                  id="building"
                  placeholder="10"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="apartment">Квартира</Label>
                <Input
                  id="apartment"
                  placeholder="25"
                  value={formData.apartment}
                  onChange={(e) => setFormData({ ...formData, apartment: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="postalCode">Индекс</Label>
              <Input
                id="postalCode"
                placeholder="123456"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Использовать по умолчанию
              </Label>
            </div>
          </div>
      </Modal>
    </div>
  );
}

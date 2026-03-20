"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Input, Typography, Button } from "antd";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.email) newErrors.email = "Введите email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = "Введите корректный email";
    if (!form.password) newErrors.password = "Введите пароль";
    else if (form.password.length < 6) newErrors.password = "Пароль минимум 6 символов";
    if (!form.confirmPassword) newErrors.confirmPassword = "Подтвердите пароль";
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Пароли не совпадают";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/customer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          name: form.name || undefined,
        }),
      });

      if (res.ok) {
        toast.success("Регистрация прошла успешно!");
        router.push("/store");
        router.refresh();
      } else {
        const data = await res.json();
        if (res.status === 409) {
          setErrors({ email: data.error || "Email уже используется" });
        } else if (res.status === 400 && data.details) {
          // Zod validation errors from server
          const fieldErrors: Record<string, string> = {};
          for (const [field, msgs] of Object.entries(data.details.fieldErrors ?? {})) {
            fieldErrors[field] = (msgs as string[])[0] ?? "Ошибка";
          }
          if (data.details.formErrors?.length) {
            fieldErrors.confirmPassword = data.details.formErrors[0];
          }
          setErrors(fieldErrors);
        } else {
          toast.error(data.error || "Ошибка регистрации");
        }
      }
    } catch {
      toast.error("Ошибка сети. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Регистрация</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Создайте аккаунт, чтобы делать заказы
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <Typography.Text strong>Email *</Typography.Text>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              disabled={loading}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1">
            <Typography.Text strong>Имя (необязательно)</Typography.Text>
            <Input
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Иван Иванов"
              value={form.name}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <Typography.Text strong>Пароль *</Typography.Text>
            <Input.Password
              name="password"
              autoComplete="new-password"
              placeholder="Минимум 6 символов"
              value={form.password}
              onChange={handleChange}
              disabled={loading}
              className={errors.password ? "border-destructive" : ""}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-1">
            <Typography.Text strong>Подтверждение пароля *</Typography.Text>
            <Input.Password
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Повторите пароль"
              value={form.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              className={errors.confirmPassword ? "border-destructive" : ""}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          <Button htmlType="submit" type="primary" className="w-full" disabled={loading}>
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Уже есть аккаунт?{" "}
          <Link href="/store/login" className="text-primary hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}

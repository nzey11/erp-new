"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, Input, Typography, Button } from "antd";
import { toast } from "sonner";

function StoreLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/store";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }

      toast.success("Вход выполнен успешно!");
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Вход</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Войдите в свой аккаунт
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Typography.Text strong>Email</Typography.Text>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Typography.Text strong>Пароль</Typography.Text>
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            htmlType="submit"
            type="primary"
            className="w-full"
            loading={loading}
          >
            {loading ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Нет аккаунта?{" "}
          <Link
            href={`/store/register${redirectTo !== "/store" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
            className="text-primary hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </div>
  );
}

export default function StoreLoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Card className="p-8 max-w-md w-full"><p className="text-center">Загрузка...</p></Card></div>}>
      <StoreLoginForm />
    </Suspense>
  );
}

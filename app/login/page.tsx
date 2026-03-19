"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCsrfToken } from "@/lib/client/csrf";
import { Button, Card, Input, Typography } from "antd";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }

      // Fetch CSRF token for subsequent requests
      await fetchCsrfToken();
      router.push("/");
      router.refresh();
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <div className="text-center pt-6 px-6">
          <img src="/oprix-logo.svg" alt="OPRIX" className="mx-auto mb-4 h-38 w-auto" />
          <p className="text-muted-foreground mt-1">Войдите в систему</p>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Typography.Text strong>Логин</Typography.Text>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="login"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Typography.Text strong>Пароль</Typography.Text>
              <Input.Password
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
              {loading ? "Вход..." : "Войти"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
        
          </p>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

function TelegramAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") || "/store/account";
  const [loading, setLoading] = useState(true);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/customer/me");
        if (res.ok) {
          router.push(redirect);
          return true;
        }
      } catch {
        // Not authenticated, continue
      }
      return false;
    };

    // Load Telegram settings from API
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/integrations/telegram");
        if (res.ok) {
          const data = await res.json();
          if (data.enabled && data.enableStoreLogin && data.botUsername) {
            setBotUsername(data.botUsername);
          }
        }
      } catch {
        // Settings not available
      }
      setLoading(false);
    };

    checkAuth().then((authenticated) => {
      if (!authenticated) {
        loadSettings();
      }
    });
  }, [router, redirect]);

  useEffect(() => {
    if (!botUsername) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.async = true;

    const container = document.getElementById("telegram-login-container");
    if (container) {
      container.appendChild(script);
    }

    // Define global callback
    (window as unknown as Record<string, unknown>).onTelegramAuth = async (user: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/auth/customer/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        if (res.ok) {
          toast.success("Успешный вход!");
          router.push(redirect);
        } else {
          const error = await res.json();
          toast.error(error.error || "Ошибка авторизации");
        }
      } catch (error) {
        console.error("Telegram auth error:", error);
        toast.error("Ошибка авторизации");
      }
    };

    return () => {
      // Cleanup
      if (container) {
        container.innerHTML = "";
      }
      delete (window as unknown as Record<string, unknown>).onTelegramAuth;
    };
  }, [botUsername, router, redirect]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 max-w-md w-full text-center">
          <p className="text-muted-foreground">Загрузка...</p>
        </Card>
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Вход недоступен</h1>
          <p className="text-muted-foreground">
            Telegram авторизация не настроена. Обратитесь к администратору.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Вход через Telegram</h1>
        <p className="text-muted-foreground mb-6">
          Войдите через Telegram, чтобы продолжить покупки
        </p>
        <div id="telegram-login-container" className="flex justify-center" />
        <p className="text-xs text-muted-foreground mt-6">
          Нажимая кнопку, вы соглашаетесь с условиями использования
        </p>
      </Card>
    </div>
  );
}

export default function TelegramAuthPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Загрузка...</div>}>
      <TelegramAuthContent />
    </Suspense>
  );
}

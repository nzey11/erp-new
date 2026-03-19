"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, Switch, Tabs, Tag, Input } from "antd";
import { Label } from "@/components/ui/label";
import { Bot, Save, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";

interface TelegramSettings {
  botToken: string;
  botUsername: string;
  enableAdminLogin: boolean;
  enableStoreLogin: boolean;
}

interface TelegramIntegrationState {
  isConfigured: boolean;
  isEnabled: boolean;
  settings: TelegramSettings;
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [telegram, setTelegram] = useState<TelegramIntegrationState>({
    isConfigured: false,
    isEnabled: false,
    settings: {
      botToken: "",
      botUsername: "",
      enableAdminLogin: false,
      enableStoreLogin: true,
    },
  });

  const loadTelegramSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/integrations/telegram");
      if (res.ok) {
        const data = await res.json();
        setTelegram(data);
      }
    } catch {
      toast.error("Ошибка загрузки настроек Telegram");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTelegramSettings();
  }, [loadTelegramSettings]);

  const saveTelegramSettings = async () => {
    setSaving(true);
    try {
      const res = await csrfFetch("/api/accounting/integrations/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(telegram.settings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Ошибка сохранения");
      }

      toast.success("Настройки Telegram сохранены");
      loadTelegramSettings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const updateTelegramSetting = <K extends keyof TelegramSettings>(
    key: K,
    value: TelegramSettings[K]
  ) => {
    setTelegram((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Интеграции" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Интеграции"
        description="Подключение внешних сервисов и API"
      />

      <Tabs
        defaultActiveKey="telegram"
        className="space-y-4"
        items={[
          {
            key: "telegram",
            label: (
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Telegram
              </span>
            ),
            children: (
              <div className="space-y-4">
                <Card title={
                  <span className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Telegram Bot
                  </span>
                } extra={
                  telegram.isConfigured ? (
                    <Tag color="green" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Подключен
                    </Tag>
                  ) : (
                    <Tag color="default" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Не настроен
                    </Tag>
                  )
                }>
                    <div className="rounded-lg border bg-muted/50 p-4">
                      <h4 className="font-medium mb-2">Как получить токен бота?</h4>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Откройте @BotFather в Telegram</li>
                        <li>Отправьте команду /newbot или выберите существующего бота</li>
                        <li>Скопируйте токен бота (формат: 123456789:ABC...)</li>
                        <li>
                          Установите домен через /setdomain для работы Login Widget
                        </li>
                      </ol>
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                      >
                        Открыть @BotFather
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="botToken">Токен бота *</Label>
                        <Input.Password
                          id="botToken"
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                          value={telegram.settings.botToken}
                          onChange={(e) => updateTelegramSetting("botToken", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Токен хранится в зашифрованном виде
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="botUsername">Имя бота (username) *</Label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-muted-foreground text-sm">
                            @
                          </span>
                          <Input
                            id="botUsername"
                            className="rounded-l-none"
                            placeholder="my_shop_bot"
                            value={telegram.settings.botUsername}
                            onChange={(e) =>
                              updateTelegramSetting("botUsername", e.target.value.replace(/^@/, ""))
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-4">
                      <h4 className="font-medium">Настройки авторизации</h4>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Вход в магазин (для покупателей)</Label>
                          <p className="text-sm text-muted-foreground">
                            Покупатели смогут входить через Telegram
                          </p>
                        </div>
                        <Switch
                          checked={telegram.settings.enableStoreLogin}
                          onChange={(v: boolean) => updateTelegramSetting("enableStoreLogin", v)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Вход в админку (для сотрудников)</Label>
                          <p className="text-sm text-muted-foreground">
                            Сотрудники смогут входить через Telegram
                          </p>
                        </div>
                        <Switch
                          checked={telegram.settings.enableAdminLogin}
                          onChange={(v: boolean) => updateTelegramSetting("enableAdminLogin", v)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                      <Button onClick={saveTelegramSettings} disabled={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? "Сохранение..." : "Сохранить настройки"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Авторизация пользователей через Telegram Login Widget
                    </p>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

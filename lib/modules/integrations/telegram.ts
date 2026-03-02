import crypto from "crypto";
import { db } from "@/lib/shared/db";
import type { TelegramIntegrationSettings, IntegrationStatus } from "./types";

const INTEGRATION_TYPE = "telegram";

/** Get Telegram integration settings from DB */
export async function getTelegramSettings(): Promise<TelegramIntegrationSettings | null> {
  const integration = await db.integration.findUnique({
    where: { type: INTEGRATION_TYPE },
  });

  if (!integration) return null;

  return integration.settings as unknown as TelegramIntegrationSettings;
}

/** Save Telegram integration settings */
export async function saveTelegramSettings(
  settings: Partial<TelegramIntegrationSettings>,
  isEnabled: boolean = true
): Promise<void> {
  const existing = await db.integration.findUnique({
    where: { type: INTEGRATION_TYPE },
  });

  const mergedSettings = existing
    ? { ...(existing.settings as object), ...settings }
    : settings;

  await db.integration.upsert({
    where: { type: INTEGRATION_TYPE },
    create: {
      type: INTEGRATION_TYPE,
      name: "Telegram Bot",
      isEnabled,
      settings: mergedSettings as object,
    },
    update: {
      isEnabled,
      settings: mergedSettings as object,
    },
  });
}

/** Get Telegram integration status */
export async function getTelegramStatus(): Promise<IntegrationStatus> {
  const settings = await getTelegramSettings();

  if (!settings) {
    return {
      type: INTEGRATION_TYPE,
      isConfigured: false,
      isEnabled: false,
      statusMessage: "Telegram бот не настроен",
    };
  }

  const isConfigured = Boolean(settings.botToken && settings.botUsername);

  return {
    type: INTEGRATION_TYPE,
    isConfigured,
    isEnabled: isConfigured,
    statusMessage: isConfigured
      ? `Подключен бот @${settings.botUsername}`
      : "Требуется настройка токена и имени бота",
  };
}

/** Verify Telegram Login Widget data using HMAC-SHA256 */
export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Check auth_date is not too old (allow 1 day)
  const authDate = parseInt(rest.auth_date || "0", 10);
  if (Date.now() / 1000 - authDate > 86400) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}

/** Get bot token from DB settings or env */
export async function getBotToken(): Promise<string | null> {
  const settings = await getTelegramSettings();
  return settings?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Get bot username from DB settings or env */
export async function getBotUsername(): Promise<string | null> {
  const settings = await getTelegramSettings();
  return settings?.botUsername || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null;
}

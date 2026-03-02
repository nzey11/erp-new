import { z } from "zod";

// POST /api/accounting/integrations/telegram
export const telegramSettingsSchema = z.object({
  botToken: z.string().min(1, "Токен бота обязателен"),
  botUsername: z
    .string()
    .min(1, "Имя бота обязательно")
    .regex(/^[a-zA-Z0-9_]+$/, "Неверный формат имени бота"),
  enableAdminLogin: z.boolean().default(false),
  enableStoreLogin: z.boolean().default(true),
});

export type TelegramSettingsInput = z.infer<typeof telegramSettingsSchema>;

import { z } from "zod";

// POST /api/auth/login
export const loginSchema = z.object({
  username: z.string().min(1, "Логин обязателен"),
  password: z.string().min(1, "Пароль обязателен"),
});

// POST /api/auth/setup
export const setupSchema = z.object({
  username: z.string().min(1, "Логин обязателен"),
  password: z.string().min(6, "Пароль минимум 6 символов"),
});

// POST /api/auth/customer/telegram
export const telegramAuthSchema = z.object({
  id: z.coerce.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  hash: z.string().min(1),
  auth_date: z.coerce.number(),
});

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


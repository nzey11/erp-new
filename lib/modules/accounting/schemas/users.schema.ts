import { z } from "zod";

// POST /api/accounting/users
export const createUserSchema = z.object({
  username: z.string().min(1, "Логин обязателен"),
  password: z.string().min(6, "Пароль минимум 6 символов"),
  email: z.string().email("Некорректный email").nullable().optional(),
  role: z.enum(["admin", "manager", "accountant", "viewer"]).default("viewer"),
});

// PUT /api/accounting/users/[id]
export const updateUserSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(6, "Пароль минимум 6 символов").optional(),
  email: z.string().email("Некорректный email").nullable().optional(),
  role: z.enum(["admin", "manager", "accountant", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

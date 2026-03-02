import { z } from "zod";

// POST /api/ecommerce/addresses
export const createAddressSchema = z.object({
  label: z.string().default("Адрес"),
  recipientName: z.string().min(1, "Имя получателя обязательно"),
  phone: z.string().min(1, "Телефон обязателен"),
  city: z.string().min(1, "Город обязателен"),
  street: z.string().min(1, "Улица обязательна"),
  building: z.string().min(1, "Дом обязателен"),
  apartment: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

// PUT /api/ecommerce/addresses
export const updateAddressSchema = z.object({
  id: z.string().min(1, "ID адреса обязателен"),
  label: z.string().optional(),
  recipientName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  apartment: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

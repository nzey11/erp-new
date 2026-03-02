import { z } from "zod";

export const createStorePageSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен"),
  slug: z.string().min(1, "Slug обязателен").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug может содержать только строчные буквы, цифры и дефисы"),
  content: z.string().default(""),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  showInFooter: z.boolean().default(true),
  showInHeader: z.boolean().default(false),
});

export const updateStorePageSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен").optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug может содержать только строчные буквы, цифры и дефисы").optional(),
  content: z.string().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  showInFooter: z.boolean().optional(),
  showInHeader: z.boolean().optional(),
});

import { z } from "zod";

export const dateRangeSchema = z.object({
  dateFrom: z.string().min(1, "Укажите дату начала"),
  dateTo: z.string().min(1, "Укажите дату окончания"),
});

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

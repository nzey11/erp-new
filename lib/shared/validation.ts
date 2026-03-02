import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: Record<string, string[]>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function parseBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.output<T>> {
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    throw new ValidationError("Ошибка валидации", fieldErrors);
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): z.output<T> {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = schema.safeParse(params);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    throw new ValidationError("Ошибка валидации параметров", fieldErrors);
  }
  return result.data;
}

export function validationError(error: unknown): NextResponse | null {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, fields: error.errors },
      { status: 400 }
    );
  }
  return null;
}

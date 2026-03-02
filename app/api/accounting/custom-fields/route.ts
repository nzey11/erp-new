import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createCustomFieldSchema } from "@/lib/modules/accounting/schemas/custom-fields.schema";

export async function GET() {
  try {
    await requirePermission("products:read");

    const fields = await db.customFieldDefinition.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(fields);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, createCustomFieldSchema);

    // For select type, validate options is a JSON array
    let optionsStr: string | null = null;
    if (data.fieldType === "select" && data.options) {
      if (!Array.isArray(data.options)) {
        return NextResponse.json(
          { error: "Для типа 'select' опции должны быть массивом" },
          { status: 400 }
        );
      }
      optionsStr = JSON.stringify(data.options);
    }

    // Get next order number
    const maxOrder = await db.customFieldDefinition.aggregate({ _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const field = await db.customFieldDefinition.create({
      data: {
        name: data.name,
        fieldType: data.fieldType,
        options: optionsStr,
        order: nextOrder,
      },
    });

    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createCustomFieldSchema } from "@/lib/modules/accounting/schemas/custom-fields.schema";
import { CustomFieldService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    await requirePermission("products:read");
    const fields = await CustomFieldService.list();
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

    const field = await CustomFieldService.create({ name: data.name, fieldType: data.fieldType, options: optionsStr });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

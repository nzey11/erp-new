import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, parseBody, validationError } from "@/lib/shared/validation";
import { generateDocumentNumber, getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { queryDocumentsSchema, createDocumentSchema } from "@/lib/modules/accounting/schemas/documents.schema";
import { DocumentService } from "@/lib/modules/accounting";
import { rateLimit } from "@/lib/shared/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("documents:read");

    const query = parseQuery(request, queryDocumentsSchema);
    const { page = 1, limit = 50, ...rest } = query;

    const { documents, total } = await DocumentService.listDocuments(
      { ...rest, page, limit },
      session.tenantId
    );

    const enriched = documents.map((doc) => ({
      ...doc,
      typeName: getDocTypeName(doc.type),
      statusName: getDocStatusName(doc.status),
    }));

    return NextResponse.json({ data: enriched, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("documents:write");

    // Rate limit: 30 requests per minute per user
    const { success: rateLimited } = rateLimit(`documents:write:${user.id}`, 30, 60 * 1000);
    if (!rateLimited) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429 }
      );
    }

    // tenantId ONLY from session — never from request body (security)
    const tenantId = user.tenantId;

    const data = await parseBody(request, createDocumentSchema);

    const number = await generateDocumentNumber(data.type);

    const result = await DocumentService.createDocument(data, tenantId, user.id, number);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ...result.document,
      typeName: getDocTypeName(result.document.type),
      statusName: getDocStatusName(result.document.status),
    }, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

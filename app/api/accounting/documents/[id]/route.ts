import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { updateDocumentSchema } from "@/lib/modules/accounting/schemas/documents.schema";
import { DocumentService, toNumber } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:read");
    const { id } = await params;

    const document = await DocumentService.getDocument(id, session.tenantId);

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    return NextResponse.json({
      ...document,
      totalAmount: toNumber(document.totalAmount),
      items: document.items.map((item) => ({
        ...item,
        price: toNumber(item.price),
        total: toNumber(item.total),
      })),
      typeName: getDocTypeName(document.type),
      statusName: getDocStatusName(document.status),
      linkedDocument: document.linkedDocument ? {
        ...document.linkedDocument,
        typeName: getDocTypeName(document.linkedDocument.type),
      } : null,
      linkedFrom: document.linkedFrom.map((d) => ({
        ...d,
        typeName: getDocTypeName(d.type),
      })),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:write");
    const { id } = await params;
    const data = await parseBody(request, updateDocumentSchema);

    const result = await DocumentService.updateDocument(id, session.tenantId, data);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ...result.document,
      typeName: getDocTypeName(result.document.type),
      statusName: getDocStatusName(result.document.status),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:write");
    const { id } = await params;

    const result = await DocumentService.deleteDocument(id, session.tenantId);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

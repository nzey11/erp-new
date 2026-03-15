import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth, requirePermission, handleAuthError } from "@/lib/shared/authorization";

export async function GET() {
  try {
    const session = await requireAuth();

    let settings = await db.tenantSettings.findUnique({
      where: { tenantId: session.tenantId },
    });
    if (!settings) {
      settings = await db.tenantSettings.create({
        data: { tenantId: session.tenantId, name: "Моя компания" },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requirePermission("settings:write");

    const body = await request.json() as {
      name?: string;
      inn?: string;
      kpp?: string;
      ogrn?: string;
      phone?: string;
      address?: string;
      fiscalYearStartMonth?: number;
    };

    let settings = await db.tenantSettings.findUnique({
      where: { tenantId: session.tenantId },
    });

    if (settings) {
      settings = await db.tenantSettings.update({
        where: { tenantId: session.tenantId },
        data: {
          name: body.name ?? settings.name,
          inn: body.inn ?? settings.inn,
          kpp: body.kpp ?? settings.kpp,
          ogrn: body.ogrn ?? settings.ogrn,
          fiscalYearStartMonth: body.fiscalYearStartMonth ?? settings.fiscalYearStartMonth,
        },
      });
    } else {
      settings = await db.tenantSettings.create({
        data: { tenantId: session.tenantId, name: body.name ?? "Моя компания", inn: body.inn, kpp: body.kpp, ogrn: body.ogrn },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return handleAuthError(error);
  }
}

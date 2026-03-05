import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

export async function GET() {
  try {
    await requirePermission("settings:read");

    let settings = await db.companySettings.findFirst();
    if (!settings) {
      settings = await db.companySettings.create({
        data: { name: "Моя компания" },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("settings:write");

    const body = await request.json() as {
      name?: string;
      inn?: string;
      kpp?: string;
      ogrn?: string;
      phone?: string;
      address?: string;
      fiscalYearStartMonth?: number;
    };

    let settings = await db.companySettings.findFirst();

    if (settings) {
      settings = await db.companySettings.update({
        where: { id: settings.id },
        data: {
          name: body.name ?? settings.name,
          inn: body.inn ?? settings.inn,
          kpp: body.kpp ?? settings.kpp,
          ogrn: body.ogrn ?? settings.ogrn,
          fiscalYearStartMonth: body.fiscalYearStartMonth ?? settings.fiscalYearStartMonth,
        },
      });
    } else {
      settings = await db.companySettings.create({
        data: { name: body.name ?? "Моя компания", inn: body.inn, kpp: body.kpp, ogrn: body.ogrn },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return handleAuthError(error);
  }
}

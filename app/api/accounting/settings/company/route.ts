import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { SettingsService } from "@/lib/modules/accounting";

export async function GET() {
  try {
    const session = await requireAuth();
    const settings = await SettingsService.getOrCreate(session.tenantId);
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

    let settings = await SettingsService.findByTenantId(session.tenantId);

    if (settings) {
      settings = await SettingsService.update(session.tenantId, {
        name: body.name ?? settings.name,
        inn: body.inn ?? settings.inn,
        kpp: body.kpp ?? settings.kpp,
        ogrn: body.ogrn ?? settings.ogrn,
        fiscalYearStartMonth: body.fiscalYearStartMonth ?? settings.fiscalYearStartMonth,
      });
    } else {
      settings = await SettingsService.create(session.tenantId, {
        name: body.name ?? "Моя компания",
        inn: body.inn,
        kpp: body.kpp,
        ogrn: body.ogrn,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return handleAuthError(error);
  }
}

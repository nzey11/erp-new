import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { telegramSettingsSchema } from "@/lib/modules/integrations/schemas";

/** GET /api/accounting/integrations/telegram - Get Telegram settings */
export async function GET() {
  try {
    await requirePermission("settings:write");

    const integration = await db.integration.findUnique({
      where: { type: "telegram" },
    });

    if (!integration) {
      return NextResponse.json({
        isConfigured: false,
        settings: {
          botToken: "",
          botUsername: "",
          enableAdminLogin: false,
          enableStoreLogin: true,
        },
      });
    }

    // Mask token for security (show only last 8 chars)
    const settings = integration.settings as Record<string, unknown>;
    const maskedToken = settings.botToken
      ? `${"*".repeat(30)}${String(settings.botToken).slice(-8)}`
      : "";

    return NextResponse.json({
      isConfigured: true,
      isEnabled: integration.isEnabled,
      settings: {
        ...settings,
        botToken: maskedToken,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** POST /api/accounting/integrations/telegram - Save Telegram settings */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("settings:write");

    const data = await parseBody(request, telegramSettingsSchema);

    // If token starts with asterisks, keep existing token
    let botToken = data.botToken;
    if (botToken.startsWith("*")) {
      const existing = await db.integration.findUnique({
        where: { type: "telegram" },
      });
      if (existing) {
        const existingSettings = existing.settings as Record<string, unknown>;
        botToken = String(existingSettings.botToken || "");
      }
    }

    const settings = {
      botToken,
      botUsername: data.botUsername.replace(/^@/, ""), // Remove @ if present
      enableAdminLogin: data.enableAdminLogin,
      enableStoreLogin: data.enableStoreLogin,
    };

    await db.integration.upsert({
      where: { type: "telegram" },
      create: {
        type: "telegram",
        name: "Telegram Bot",
        isEnabled: true,
        settings,
      },
      update: {
        settings,
        isEnabled: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

/** DELETE /api/accounting/integrations/telegram - Disable Telegram integration */
export async function DELETE() {
  try {
    await requirePermission("settings:write");

    await db.integration.update({
      where: { type: "telegram" },
      data: { isEnabled: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

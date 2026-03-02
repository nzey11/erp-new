import { NextResponse } from "next/server";
import { db } from "@/lib/shared/db";

/** GET /api/integrations/telegram - Get public Telegram settings (no auth required) */
export async function GET() {
  try {
    const integration = await db.integration.findUnique({
      where: { type: "telegram" },
    });

    if (!integration || !integration.isEnabled) {
      return NextResponse.json({ enabled: false });
    }

    const settings = integration.settings as Record<string, unknown>;
    
    // Only return public info (NOT the token!)
    return NextResponse.json({
      enabled: true,
      botUsername: settings.botUsername || null,
      enableStoreLogin: settings.enableStoreLogin ?? true,
      enableAdminLogin: settings.enableAdminLogin ?? false,
    });
  } catch (error) {
    console.error("Error fetching Telegram settings:", error);
    return NextResponse.json({ enabled: false });
  }
}

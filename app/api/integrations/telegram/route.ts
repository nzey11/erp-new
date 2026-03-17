import { NextResponse } from "next/server";
import { logger } from "@/lib/shared/logger";
import { CustomerService } from "@/lib/modules/ecommerce";

/** GET /api/integrations/telegram - Get public Telegram settings (no auth required) */
export async function GET() {
  try {
    const integration = await CustomerService.findTelegramIntegration();

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
    logger.error("telegram-integration", "Failed to fetch Telegram settings", error);
    return NextResponse.json({ enabled: false });
  }
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { signCustomerSession, CUSTOMER_COOKIE_NAME, CUSTOMER_SESSION_MAX_AGE } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { telegramAuthSchema } from "@/lib/shared/schemas/auth.schema";
import { logger } from "@/lib/shared/logger";
import { resolveParty } from "@/lib/domain/party";
import { CustomerService } from "@/lib/modules/ecommerce";

/** Get bot token from DB or env */
async function getBotToken(): Promise<string | null> {
  const integration = await CustomerService.findTelegramIntegration();
  
  if (integration?.isEnabled) {
    const settings = integration.settings as Record<string, unknown>;
    if (settings.botToken) return String(settings.botToken);
  }
  
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Verify Telegram Login Widget data using HMAC-SHA256. */
function verifyTelegramAuth(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Check auth_date is not too old (allow 1 day)
  const authDate = parseInt(rest.auth_date || "0", 10);
  if (Date.now() / 1000 - authDate > 86400) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  return hmac === hash;
}

/** POST /api/auth/customer/telegram — Telegram Login Widget callback */
export async function POST(request: NextRequest) {
  try {
    const botToken = await getBotToken();
    if (!botToken) {
      return NextResponse.json({ error: "Telegram не настроен" }, { status: 500 });
    }

    const { id, first_name, last_name, username, hash, auth_date } = await parseBody(request, telegramAuthSchema);

    // Build data object for verification
    const authData: Record<string, string> = { id: String(id), auth_date: String(auth_date) };
    if (first_name) authData.first_name = first_name;
    if (last_name) authData.last_name = last_name;
    if (username) authData.username = username;
    authData.hash = hash;

    if (!verifyTelegramAuth(authData, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram authentication" }, { status: 401 });
    }

    const telegramId = String(id);
    const name = [first_name, last_name].filter(Boolean).join(" ") || undefined;

    // Find or create customer
    let customer = await CustomerService.findByTelegramId(telegramId);

    let isNewCustomer = false;

    if (customer) {
      // Update info on each login
      customer = await CustomerService.updateTelegramInfo(customer.id, {
        telegramUsername: username || undefined,
        name: name || customer.name || undefined,
      });
    } else {
      customer = await CustomerService.create({
        telegramId,
        telegramUsername: username || undefined,
        name,
      });
      isNewCustomer = true;
    }

    if (!customer.isActive) {
      return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
    }

    // P2-04: Ensure every new Customer has a Party mirror at creation time.
    // resolveParty() is not transaction-aware (uses global db client internally);
    // it cannot share a db.$transaction() with db.customer.create().
    // Per roadmap: failure must not block login — log and continue (Party can be backfilled).
    if (isNewCustomer) {
      try {
        await resolveParty({ customerId: customer.id });
      } catch (partyError) {
        logger.error(
          "telegram-auth",
          "Party mirror creation failed for new Customer — will be backfilled",
          { customerId: customer.id, error: partyError }
        );
        // Intentionally not re-throwing: login must succeed even if Party creation fails.
      }
    }

    // Create session
    const token = signCustomerSession(customer.id);
    const response = NextResponse.json({
      id: customer.id,
      name: customer.name,
      telegramUsername: customer.telegramUsername,
    });

    response.cookies.set(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("telegram-auth", "Telegram authentication failed", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

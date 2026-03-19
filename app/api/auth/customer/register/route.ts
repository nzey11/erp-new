import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signCustomerSession, CUSTOMER_COOKIE_NAME, CUSTOMER_SESSION_MAX_AGE } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { CustomerService } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";
import { resolveParty } from "@/lib/domain/party";

const registerSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль минимум 6 символов"),
  confirmPassword: z.string().min(1, "Подтвердите пароль"),
  name: z.string().min(1).max(100).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

/** POST /api/auth/customer/register — Register with email + password */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await parseBody(request, registerSchema);

    // Check duplicate email
    const existing = await CustomerService.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
    }

    // Create customer with hashed password
    const customer = await CustomerService.createWithPassword({ email, password, name });

    // P2-04: Create Party mirror — failure must not block registration
    try {
      await resolveParty({ customerId: customer.id });
    } catch (partyError) {
      logger.error(
        "customer-register",
        "Party mirror creation failed — will be backfilled",
        { customerId: customer.id, error: partyError }
      );
    }

    // Auto-login: set session cookie
    const token = signCustomerSession(customer.id);
    const response = NextResponse.json(
      { id: customer.id, email: customer.email, name: customer.name },
      { status: 201 }
    );

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
    logger.error("customer-register", "Registration failed", error);
    return NextResponse.json({ error: "Ошибка регистрации" }, { status: 500 });
  }
}

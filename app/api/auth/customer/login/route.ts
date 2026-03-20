import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signCustomerSession, CUSTOMER_COOKIE_NAME, CUSTOMER_SESSION_MAX_AGE } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { CustomerService } from "@/lib/modules/ecommerce";
import { logger } from "@/lib/shared/logger";

const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

/** POST /api/auth/customer/login — Login with email + password */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await parseBody(request, loginSchema);

    // Find customer by email
    const customer = await CustomerService.findByEmail(email);
    if (!customer || !customer.isActive) {
      logger.warn("customer-login", "Login failed: customer not found or inactive", { email });
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await CustomerService.verifyPassword(customer, password);
    if (!isValid) {
      logger.warn("customer-login", "Login failed: wrong password", { email });
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    // Create session
    const token = signCustomerSession(customer.id);
    const response = NextResponse.json({
      id: customer.id,
      email: customer.email,
      name: customer.name,
    });

    response.cookies.set(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_MAX_AGE,
    });

    logger.info("customer-login", "Login successful", {
      customerId: customer.id,
      email: customer.email,
    });

    return response;
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("customer-login", "Login failed", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}

import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "customer_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set in environment variables");
  }
  return secret;
}

/** Sign a customer ID to create a tamper-proof session token. Format: customerId.hmacSignature */
export function signCustomerSession(customerId: string): string {
  const secret = getSessionSecret();
  const signature = crypto.createHmac("sha256", secret).update(`customer:${customerId}`).digest("hex");
  return `${customerId}.${signature}`;
}

/** Verify a customer session token and extract the customer ID. Returns customerId or null. */
export function verifyCustomerSession(token: string): string | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const customerId = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  try {
    const secret = getSessionSecret();
    const expected = crypto.createHmac("sha256", secret).update(`customer:${customerId}`).digest("hex");

    if (signature.length !== expected.length) return null;
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );

    return isValid ? customerId : null;
  } catch {
    return null;
  }
}

/** Get the authenticated customer from session cookie. Returns customer or null. */
export async function getCustomerSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    const customerId = verifyCustomerSession(sessionCookie);
    if (!customerId) return null;

    const { db } = await import("./db");
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, telegramId: true, telegramUsername: true, name: true, phone: true, email: true, isActive: true },
    });

    if (!customer || !customer.isActive) return null;
    return customer;
  } catch {
    return null;
  }
}

/** Require authenticated customer or throw. */
export async function requireCustomer() {
  const customer = await getCustomerSession();
  if (!customer) {
    throw new CustomerAuthError("Unauthorized", 401);
  }
  return customer;
}

/** Return a 401 Unauthorized JSON response for customers. */
export function unauthorizedCustomerResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Handle customer auth errors in API routes. */
export function handleCustomerAuthError(error: unknown) {
  if (error instanceof CustomerAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export class CustomerAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "CustomerAuthError";
  }
}

export { COOKIE_NAME as CUSTOMER_COOKIE_NAME, SESSION_MAX_AGE as CUSTOMER_SESSION_MAX_AGE };

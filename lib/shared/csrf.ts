/**
 * CSRF Protection utilities.
 * Generates and validates CSRF tokens for cookie-based authentication.
 */

import crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically secure CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Create a signed CSRF token using HMAC.
 * The token is signed with SESSION_SECRET to prevent tampering.
 */
export function signCsrfToken(token: string, secret: string): string {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(token)
    .digest("hex");
  return `${token}.${hmac}`;
}

/**
 * Verify a signed CSRF token.
 */
export function verifyCsrfToken(signedToken: string, secret: string): boolean {
  const [token, signature] = signedToken.split(".");
  if (!token || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(token)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Extract CSRF token from request (header or body).
 */
export function getCsrfTokenFromRequest(request: Request): string | null {
  // Check header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;

  // Check form data or JSON body
  const contentType = request.headers.get("content-type") || "";
  
  if (contentType.includes("application/json")) {
    // For JSON, we need to clone and parse
    // This should be called before other body reads
    return null; // Caller should parse body themselves
  }

  return null;
}

/**
 * Validate CSRF token from request against cookie.
 */
export function validateCsrf(
  request: Request,
  secret: string
): { valid: boolean; error?: string } {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );

  const signedCookieToken = cookies[CSRF_COOKIE_NAME];
  if (!signedCookieToken) {
    return { valid: false, error: "CSRF cookie not found" };
  }

  // Verify cookie signature
  if (!verifyCsrfToken(signedCookieToken, secret)) {
    return { valid: false, error: "Invalid CSRF cookie signature" };
  }

  // Get token from request
  const requestToken = getCsrfTokenFromRequest(request);
  if (!requestToken) {
    return { valid: false, error: "CSRF token not found in request" };
  }

  // Extract token from signed cookie
  const [cookieToken] = signedCookieToken.split(".");

  // Compare tokens
  if (requestToken !== cookieToken) {
    return { valid: false, error: "CSRF token mismatch" };
  }

  return { valid: true };
}

/**
 * Check if a request method requires CSRF protection.
 */
export function requiresCsrfProtection(method: string): boolean {
  const protectedMethods = ["POST", "PUT", "PATCH", "DELETE"];
  return protectedMethods.includes(method.toUpperCase());
}

/**
 * Check if a path should be excluded from CSRF protection.
 */
export function isCsrfExemptPath(pathname: string): boolean {
  const exemptPatterns = [
    /^\/api\/auth\/login/,        // Login doesn't have CSRF yet
    /^\/api\/auth\/csrf/,         // CSRF token endpoint
    /^\/api\/webhooks/,           // Webhooks use other auth
    /^\/api\/ecommerce\/checkout/, // Checkout uses customer auth
    /^\/api\/ecommerce\/orders/,  // Orders use customer auth
  ];

  return exemptPatterns.some((pattern) => pattern.test(pathname));
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

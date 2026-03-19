/**
 * CSRF Protection utilities.
 * Generates and validates CSRF tokens for cookie-based authentication.
 * Compatible with Edge Runtime (uses Web Crypto API).
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Convert Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe comparison of two strings.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a cryptographically secure CSRF token.
 * Uses Web Crypto API for Edge Runtime compatibility.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Create a signed CSRF token using HMAC-SHA256.
 * The token is signed with SESSION_SECRET to prevent tampering.
 * Uses Web Crypto API for Edge Runtime compatibility.
 */
export async function signCsrfToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const tokenData = encoder.encode(token);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, tokenData);
  const signatureHex = bytesToHex(new Uint8Array(signature));
  return `${token}.${signatureHex}`;
}

/**
 * Verify a signed CSRF token.
 * Uses Web Crypto API for Edge Runtime compatibility.
 */
export async function verifyCsrfToken(signedToken: string, secret: string): Promise<boolean> {
  const [token, signature] = signedToken.split(".");
  if (!token || !signature) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const tokenData = encoder.encode(token);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSignature = await crypto.subtle.sign("HMAC", key, tokenData);
  const expectedHex = bytesToHex(new Uint8Array(expectedSignature));

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(signature, expectedHex);
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
export async function validateCsrf(
  request: Request,
  secret: string
): Promise<{ valid: boolean; error?: string }> {
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
  if (!(await verifyCsrfToken(signedCookieToken, secret))) {
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
    /^\/api\/auth\/logout/,       // Logout must always work (cookie cleared server-side)
    /^\/api\/auth\/csrf/,         // CSRF token endpoint
    /^\/api\/webhooks/,           // Webhooks use other auth
    /^\/api\/ecommerce\/checkout/, // Checkout uses customer auth
    /^\/api\/ecommerce\/orders/,  // Orders use customer auth
  ];

  return exemptPatterns.some((pattern) => pattern.test(pathname));
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

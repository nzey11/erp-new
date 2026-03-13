import { NextRequest, NextResponse } from "next/server";
import {
  requiresCsrfProtection,
  isCsrfExemptPath,
  validateCsrf,
} from "@/lib/shared/csrf";
import { rateLimit, getClientIp } from "@/lib/shared/rate-limit";
import { logger } from "@/lib/shared/logger";

const REQUEST_ID_HEADER = "X-Request-Id";

/** Generate a UUID compatible with edge runtime */
function generateUUID(): string {
  // Use Web Crypto API if available (edge runtime)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Routes that require NO authentication at all
const PUBLIC_ROUTES = ["/login", "/setup", "/api/auth/login", "/api/auth/setup", "/api/integrations"];

// Storefront routes accessible without any session (public pages)
const STOREFRONT_PUBLIC = ["/store/catalog", "/store/auth", "/api/ecommerce/products", "/api/ecommerce/categories", "/api/ecommerce/promo-blocks", "/api/ecommerce/delivery"];

// Storefront routes that require customer_session cookie
const STOREFRONT_CUSTOMER = ["/store/cart", "/store/checkout", "/store/account"];

// Customer auth API routes (public - handle own auth)
const CUSTOMER_AUTH_ROUTES = ["/api/auth/customer"];

// Webhook routes (public, no auth)
const WEBHOOK_ROUTES = ["/api/webhooks/"];

// E-commerce API routes requiring customer auth
const ECOMMERCE_CUSTOMER_API = ["/api/ecommerce/cart", "/api/ecommerce/checkout", "/api/ecommerce/orders", "/api/ecommerce/favorites", "/api/ecommerce/addresses", "/api/ecommerce/reviews"];

// Redirects from old routes to new ones
const REDIRECTS: Record<string, string> = {
  "/documents": "/purchases",
  "/products": "/catalog",
  "/warehouses": "/references",
  "/reports": "/finance",
};

/** Add request ID header to response */
function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate request ID for tracing
  const requestId = request.headers.get(REQUEST_ID_HEADER) || generateUUID();

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  // Public routes - no auth required
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Webhook routes - public, no auth
  if (WEBHOOK_ROUTES.some((route) => pathname.startsWith(route))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Customer auth routes - public, handle their own auth
  if (CUSTOMER_AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Storefront homepage
  if (pathname === "/store" || pathname === "/store/") {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Public storefront pages and APIs
  if (STOREFRONT_PUBLIC.some((route) => pathname.startsWith(route))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Customer-protected storefront pages
  if (STOREFRONT_CUSTOMER.some((route) => pathname.startsWith(route))) {
    const customerSession = request.cookies.get("customer_session")?.value;
    if (!customerSession) {
      if (pathname.startsWith("/api/")) {
        return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), requestId);
      }
      return NextResponse.redirect(new URL("/store/auth/telegram", request.url));
    }
    return withRequestId(NextResponse.next(), requestId);
  }

  // E-commerce API routes requiring customer auth
  if (ECOMMERCE_CUSTOMER_API.some((route) => pathname.startsWith(route))) {
    const customerSession = request.cookies.get("customer_session")?.value;
    if (!customerSession) {
      return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), requestId);
    }
    return withRequestId(NextResponse.next(), requestId);
  }

  // ---- Everything below is ERP (accounting) ----

  // Check ERP session cookie
  const session = request.cookies.get("session")?.value;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), requestId);
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // CSRF Protection for ERP API routes
  if (
    pathname.startsWith("/api/") &&
    requiresCsrfProtection(request.method) &&
    !isCsrfExemptPath(pathname)
  ) {
    const secret = process.env.SESSION_SECRET;
    if (secret) {
      const csrfResult = validateCsrf(request, secret);
      if (!csrfResult.valid) {
        logger.warn("csrf", "CSRF validation failed", {
          pathname,
          method: request.method,
          error: csrfResult.error,
        });
        return withRequestId(
          NextResponse.json(
            { error: "CSRF validation failed", details: csrfResult.error },
            { status: 403 }
          ),
          requestId
        );
      }
    }
  }

  // Handle old route redirects (only for authenticated ERP users)
  if (REDIRECTS[pathname]) {
    return NextResponse.redirect(new URL(REDIRECTS[pathname], request.url));
  }

  return withRequestId(NextResponse.next(), requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

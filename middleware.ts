import { NextRequest, NextResponse } from "next/server";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Public routes - no auth required
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Webhook routes - public, no auth
  if (WEBHOOK_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Customer auth routes - public, handle their own auth
  if (CUSTOMER_AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Storefront homepage
  if (pathname === "/store" || pathname === "/store/") {
    return NextResponse.next();
  }

  // Public storefront pages and APIs
  if (STOREFRONT_PUBLIC.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Customer-protected storefront pages
  if (STOREFRONT_CUSTOMER.some((route) => pathname.startsWith(route))) {
    const customerSession = request.cookies.get("customer_session")?.value;
    if (!customerSession) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/store/auth/telegram", request.url));
    }
    return NextResponse.next();
  }

  // E-commerce API routes requiring customer auth
  if (ECOMMERCE_CUSTOMER_API.some((route) => pathname.startsWith(route))) {
    const customerSession = request.cookies.get("customer_session")?.value;
    if (!customerSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ---- Everything below is ERP (accounting) ----

  // Check ERP session cookie
  const session = request.cookies.get("session")?.value;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Handle old route redirects (only for authenticated ERP users)
  if (REDIRECTS[pathname]) {
    return NextResponse.redirect(new URL(REDIRECTS[pathname], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

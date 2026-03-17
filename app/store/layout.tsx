"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/shared/utils";
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  Heart,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { CartProvider, useCart } from "@/components/domain/ecommerce/CartContext";

type CmsPageLink = {
  id: string;
  title: string;
  slug: string;
  showInFooter: boolean;
  showInHeader: boolean;
};

function CartBadge() {
  const { count } = useCart();
  return (
    <Link href="/store/cart">
      <Button variant="ghost" size="icon" className="relative text-muted-foreground">
        <ShoppingCart className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
    </Link>
  );
}

function StoreContent({
  children,
  customer,
  cmsPages,
}: {
  children: React.ReactNode;
  customer: { id: string; name: string | null; telegramUsername: string | null } | null;
  cmsPages: CmsPageLink[];
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Каталог", href: "/store/catalog" },
    ...cmsPages
      .filter((p) => p.showInHeader)
      .map((p) => ({ name: p.title, href: `/store/pages/${p.slug}` })),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/store" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              L
            </div>
            <span className="font-semibold text-lg hidden sm:block">ListOpt</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname.startsWith(link.href) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link href="/store/catalog">
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Search className="h-5 w-5" />
              </Button>
            </Link>

            {customer && (
              <Link href="/store/account/favorites">
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Heart className="h-5 w-5" />
                </Button>
              </Link>
            )}

            <CartBadge />

            {customer ? (
              <Link href="/store/account">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:block">{customer.name || customer.telegramUsername || "Кабинет"}</span>
                </Button>
              </Link>
            ) : (
              <Link href="/store/auth/telegram">
                <Button variant="outline" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:block">Войти</span>
                </Button>
              </Link>
            )}

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2 text-sm font-medium"
              >
                {link.name}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="container mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50 mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold mb-3">О магазине</h3>
              <p className="text-sm text-muted-foreground">
                ListOpt — оптовая торговля с удобной системой заказов.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Покупателям</h3>
              <div className="space-y-2">
                <Link href="/store/catalog" className="block text-sm text-muted-foreground hover:text-foreground">Каталог</Link>
                <Link href="/store/account/orders" className="block text-sm text-muted-foreground hover:text-foreground">Мои заказы</Link>
                <Link href="/store/account/favorites" className="block text-sm text-muted-foreground hover:text-foreground">Избранное</Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Информация</h3>
              <div className="space-y-2">
                {cmsPages.filter((p) => p.showInFooter).map((p) => (
                  <Link
                    key={p.id}
                    href={`/store/pages/${p.slug}`}
                    className="block text-sm text-muted-foreground hover:text-foreground"
                  >
                    {p.title}
                  </Link>
                ))}
                {cmsPages.filter((p) => p.showInFooter).length === 0 && (
                  <p className="text-sm text-muted-foreground">Свяжитесь с нами для уточнения деталей заказа.</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            ListOpt ERP &copy; {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [customer, setCustomer] = useState<{ id: string; name: string | null; telegramUsername: string | null } | null>(null);
  const [cmsPages, setCmsPages] = useState<CmsPageLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/customer/me");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCustomer(data);
        }
      } catch {
        // Not authenticated
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ecommerce/cms-pages");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCmsPages(data.data || []);
        }
      } catch {
        // Ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <CartProvider isAuthenticated={!!customer}>
      <StoreContent customer={customer} cmsPages={cmsPages}>
        {children}
      </StoreContent>
    </CartProvider>
  );
}

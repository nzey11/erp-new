"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/shared/utils";
import {
  LayoutDashboard,
  Package,
  Users,
  Boxes,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  ChevronDown,
  Calculator,
  ShoppingBag,
  Bot,
  Check,
  ShoppingCart,
  TrendingUp,
  Wallet,
  BookOpen,
  Star,
  Image,
  Plug,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";

// Module definitions for the switcher
const modules = [
  { id: "accounting", name: "Система учёта", icon: Calculator, available: true },
  { id: "finance", name: "Финансы", icon: Wallet, available: true },
  { id: "ecommerce", name: "E-commerce", icon: ShoppingBag, available: true },
  { id: "ai-office", name: "AI Office", icon: Bot, available: false },
];

// Navigation items per module
const moduleNavigation: Record<string, Array<{ name: string; href: string; icon: React.ComponentType<{ className?: string }> }>> = {
  accounting: [
    { name: "Панель", href: "/", icon: LayoutDashboard },
    { name: "Каталог", href: "/catalog", icon: Package },
    { name: "Склад", href: "/stock", icon: Boxes },
    { name: "Закупки", href: "/purchases", icon: ShoppingCart },
    { name: "Продажи", href: "/sales", icon: TrendingUp },
    { name: "Контрагенты", href: "/counterparties", icon: Users },
    { name: "Справочники", href: "/references", icon: BookOpen },
  ],
  finance: [
    { name: "Дашборд", href: "/finance/dashboard", icon: LayoutDashboard },
    { name: "Платежи", href: "/finance/payments", icon: Wallet },
    { name: "Отчёты", href: "/finance/reports", icon: TrendingUp },
    { name: "Взаиморасчёты", href: "/finance/balances", icon: Users },
    { name: "Статьи", href: "/finance/categories", icon: BookOpen },
  ],
  ecommerce: [
    { name: "Заказы клиентов", href: "/ecommerce/orders", icon: ShoppingCart },
    { name: "Промо-блоки", href: "/ecommerce/promo-blocks", icon: Image },
    { name: "Отзывы", href: "/ecommerce/reviews", icon: Star },
    { name: "CMS-страницы", href: "/cms-pages", icon: FileText },
  ],
  "ai-office": [],
};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const getModuleFromPath = (path: string) => {
    if (path.startsWith("/finance")) return "finance";
    if (path.startsWith("/ecommerce") || path.startsWith("/cms-pages")) return "ecommerce";
    return "accounting";
  };

  const [currentModule, setCurrentModuleState] = useState(() => getModuleFromPath(pathname));

  const setCurrentModule = (moduleId: string) => {
    setCurrentModuleState(moduleId);
    // Redirect to the first page of the selected module
    const firstNavItem = moduleNavigation[moduleId]?.[0];
    if (firstNavItem) {
      router.push(firstNavItem.href);
    }
  };

  const currentModuleData = modules.find((m) => m.id === currentModule)!;
  const navigation = moduleNavigation[currentModule] || [];

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              L
            </div>
            <span className="font-semibold text-lg">ListOpt</span>
          </Link>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold mx-auto">
            L
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Module Switcher */}
      <div className="p-2 border-b">
        {!mounted ? (
          <Button variant="outline" className={cn("w-full justify-between font-normal", collapsed && "px-2")} disabled>
            <div className="flex items-center gap-2">
              <currentModuleData.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{currentModuleData.name}</span>}
            </div>
            {!collapsed && <ChevronDown className="h-4 w-4 opacity-50" />}
          </Button>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-between font-normal",
                collapsed && "px-2"
              )}
            >
              <div className="flex items-center gap-2">
                <currentModuleData.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{currentModuleData.name}</span>}
              </div>
              {!collapsed && <ChevronDown className="h-4 w-4 opacity-50" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {modules.map((module) => (
              <DropdownMenuItem
                key={module.id}
                disabled={!module.available}
                onClick={() => module.available && setCurrentModule(module.id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <module.icon className="h-4 w-4" />
                  <span>{module.name}</span>
                </div>
                {module.id === currentModule && (
                  <Check className="h-4 w-4" />
                )}
                {!module.available && (
                  <span className="text-xs text-muted-foreground">скоро</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              Модули можно подключить в настройках
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navigation.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors mb-1",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t p-2 space-y-1">
        <Link
          href="/integrations"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === "/integrations"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          title={collapsed ? "Интеграции" : undefined}
        >
          <Plug className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Интеграции</span>}
        </Link>
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          title={collapsed ? "Настройки" : undefined}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Настройки</span>}
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-sidebar border-r transition-all duration-200",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

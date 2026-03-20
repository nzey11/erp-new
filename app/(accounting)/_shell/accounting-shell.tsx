"use client";

import { Suspense, useEffect } from "react";
import { App, ConfigProvider } from "antd";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { getCsrfToken } from "@/lib/client/csrf";
import { antdTheme, antdLocale, validateMessages } from "@/lib/antd-theme";

/**
 * Client shell for the accounting layout.
 * Handles CSRF prefetch (requires useEffect → client component).
 * Auth check is done server-side in the parent layout.tsx.
 * Note: AntdRegistry is in root layout.tsx, not needed here.
 */
export default function AccountingClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Prefetch CSRF token on app load
  useEffect(() => {
    getCsrfToken().catch(() => {/* ignore - will retry on next request */});
  }, []);

  return (
    <ConfigProvider theme={antdTheme} locale={antdLocale} form={{ validateMessages }}>
      <App>
        <div className="min-h-screen">
          <AppSidebar />
          <main className="md:pl-64 transition-all duration-200">
            <div className="p-4 md:p-6 lg:p-8 pt-14 md:pt-6">
              <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
                {children}
              </Suspense>
            </div>
          </main>
        </div>
      </App>
    </ConfigProvider>
  );
}

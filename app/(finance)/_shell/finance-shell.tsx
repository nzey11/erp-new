"use client";

import { Suspense } from "react";
import { App, ConfigProvider } from "antd";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { antdTheme, antdLocale, validateMessages } from "@/lib/antd-theme";

/**
 * Client shell for the finance layout.
 * Uses ConfigProvider for Ant Design theme.
 * Auth check is done server-side in the parent layout.tsx.
 * Note: AntdRegistry is in root layout.tsx, not needed here.
 */
export default function FinanceClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
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

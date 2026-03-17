"use client";

import { Suspense } from "react";
import { App, ConfigProvider } from "antd";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { antdTheme } from "@/lib/antd-theme";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider theme={antdTheme}>
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

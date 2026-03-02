"use client";

import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
  );
}

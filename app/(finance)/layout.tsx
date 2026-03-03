import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/shared/utils";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppSidebar />
      <main
        className={cn(
          "transition-all duration-200",
          "md:ml-16"
        )}
      >
        <div className="p-4 md:p-6 pt-16 md:pt-6">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}

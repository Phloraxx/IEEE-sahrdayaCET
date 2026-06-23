import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { Toaster } from "@/components/ui/sonner";
import AdminGuard from "@/components/admin/AdminGuard";
import { AdminKeyboardShortcuts } from "@/components/admin/KeyboardShortcuts";
import { PageTransition } from "@/components/admin/PageTransition";
export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  ),
});

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  return (
    <AdminGuard>
      <AdminKeyboardShortcuts />
      <div
        className="admin-editorial"
        style={{ display: "flex", minHeight: "100vh" }}
      >
        <AdminSidebar
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          toggleMobile={toggleMobile}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          <AdminTopbar onToggleMobile={toggleMobile} />
          <main className="main-content">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
      <Toaster />
    </AdminGuard>
  );
}

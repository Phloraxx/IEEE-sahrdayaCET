import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageTransition } from "@/components/admin/page-transition";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("ieee-theme", next);
      } catch {
        /* localStorage unavailable */
      }
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return { theme, toggle };
}

function AdminLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNavigating] = useState(false);
  const { theme, toggle } = useTheme();
  const openTriggerRef = useRef<HTMLElement | null>(null);

  // Escape-to-close + body scroll lock
  useEffect(() => {
    if (!sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      openTriggerRef.current?.focus();
    };
  }, [sidebarOpen]);

  const openSidebar = (e: React.MouseEvent<HTMLElement>) => {
    openTriggerRef.current = e.currentTarget;
    setSidebarOpen(true);
  };

  return (
    <AdminGuard>
      <div className="vh-admin flex h-screen overflow-hidden bg-background text-foreground">
        <AdminSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userRole={user?.role ?? ""}
          theme={theme}
          onThemeToggle={toggle}
        />

        <div className="flex flex-1 flex-col lg:pl-64">
          <AdminTopbar
            onOpenSidebar={openSidebar}
            sidebarOpen={sidebarOpen}
            isNavigating={isNavigating}
          />

          <main
            id="primary-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto focus:outline-none"
          >
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}

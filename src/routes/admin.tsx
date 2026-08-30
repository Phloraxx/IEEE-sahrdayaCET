import { Navigate, Outlet, useLocation, useNavigation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageTransition } from "@/components/admin/page-transition";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { canAccessWorkspacePath, preferredWorkspacePath } from "@/lib/workspace-permissions";


export const meta = () => [
  { name: "robots", content: "noindex, nofollow" },
];

function useTheme() {
  // Admin defaults to dark. The inline script in __root.tsx already
  // toggled the `dark` class before paint on any /admin route, so SSR
  // and the first client render match. We sync React state to that
  // class here.
  const [theme, setTheme] = useState<"light" | "dark">("dark");

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

export default function AdminLayout() {
  const { user } = useAuth();
  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const openTriggerRef = useRef<HTMLElement | null>(null);
  const routeAllowed = workspace.data ? canAccessWorkspacePath(workspace.data, location.pathname) : true;
  const fallbackPath = workspace.data ? preferredWorkspacePath(workspace.data) : "/";

  // Escape-to-close + body scroll lock when the mobile drawer is open
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
      {!routeAllowed ? <Navigate to={fallbackPath} replace /> : <div className="vh-admin flex w-full min-w-0 vh-h-screen-dynamic overflow-hidden bg-background text-foreground">
        {/* Skip-to-main link — keyboard only */}
        <a
          href="#primary-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>

        {workspace.data && <AdminSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userRole={user?.role ?? ""}
          userEmail={user?.email ?? undefined}
          workspace={workspace.data}
          theme={theme}
          onThemeToggle={toggle}
        />}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          {workspace.data && <AdminTopbar
            onOpenSidebar={openSidebar}
            sidebarOpen={sidebarOpen}
            isNavigating={isNavigating}
            workspace={workspace.data}
          />}

          <main
            id="primary-content"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-y-auto focus:outline-none"
          >
            <div
              className={cn(
                "mx-auto w-full min-w-0 max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7 transition-opacity duration-300 ease-out",
                isNavigating ? "opacity-60" : "opacity-100",
              )}
            >
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>}
    </AdminGuard>
  );
}

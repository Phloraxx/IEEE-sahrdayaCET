"use client";

import { useEffect, useRef } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Calendar,
  QrCode,
  ClipboardList,
  CreditCard,
  Building2,
  Users,
  UserCog,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/components/admin/use-theme";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard },
  { title: "Events", url: "/admin/events", icon: Calendar },
  { title: "Check-in", url: "/admin/check-in", icon: QrCode },
  { title: "Registrations", url: "/admin/registrations", icon: ClipboardList, adminOnly: true },
  { title: "Payments", url: "/admin/payments", icon: CreditCard, adminOnly: true },
  { title: "Societies", url: "/admin/societies", icon: Building2, adminOnly: true },
  { title: "Execom", url: "/admin/execom", icon: Users, adminOnly: true },
  { title: "Users", url: "/admin/users", icon: UserCog, adminOnly: true },
];

export function AdminSidebar({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const pathname = useLocation().pathname;
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const openTriggerRef = useRef<HTMLElement | null>(null);

  const isActive = (url: string) =>
    url === "/admin" ? pathname === "/admin" : pathname.startsWith(url);

  // Close on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Drawer: Escape-to-close, body scroll lock, focus return
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
  }, [sidebarOpen, setSidebarOpen]);

  const openSidebar = (e: React.MouseEvent<HTMLElement>) => {
    openTriggerRef.current = e.currentTarget;
    setSidebarOpen(true);
  };

  const roleLabel =
    user?.role === "admin"
      ? "Admin"
      : user?.role === "chair"
        ? "Chair"
        : "User";

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Skip-to-main */}
      <a
        href="#primary-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        id="primary-sidebar"
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground drawer-slide lg:w-64 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand header */}
        <div className="relative flex h-16 items-center justify-center border-b border-sidebar-border px-4">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2.5"
            aria-label="IEEE SB Admin"
          >
            <img
              src="/favicon.svg"
              alt="IEEE"
              className="h-6 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-sidebar-foreground">
                IEEE Sahrdaya
              </span>
              <span className="text-[0.6rem] uppercase tracking-[0.06em] text-sidebar-foreground/50">
                Student Branch
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role context */}
        <div className="border-b border-sidebar-border px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/50">
              Logged in as
            </p>
            <button
              type="button"
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-sm font-medium text-sidebar-foreground">
            {roleLabel}
          </p>
          <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
        </div>

        {/* Nav — flat list, no section groups */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              if (item.adminOnly && user?.role !== "admin") return null;
              const Icon = item.icon;
              const active = isActive(item.url);
              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-primary"
                          : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70",
                      )}
                    />
                    <span className="flex-1 truncate">{item.title}</span>
                    {active && <ChevronRight className="h-3 w-3 text-primary" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Link
            to="/"
            className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Back to Site</span>
          </Link>
          <button
            onClick={signOut}
            type="button"
            className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

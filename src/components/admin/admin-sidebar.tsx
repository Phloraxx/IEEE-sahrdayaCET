import {
  ChevronRight,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Users,
  UserCheck,
  Building2,
  ScanLine,
  X,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    description: "Overview",
  },
  {
    label: "Events",
    href: "/admin/events",
    icon: Calendar,
    description: "Manage events",
  },
  {
    label: "Registrations",
    href: "/admin/registrations",
    icon: ClipboardList,
    description: "Sign-ups",
  },
  {
    label: "Societies",
    href: "/admin/societies",
    icon: Building2,
    description: "Chapters",
    adminOnly: true,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    description: "Members",
    adminOnly: true,
  },
  {
    label: "Execom",
    href: "/admin/execom",
    icon: UserCheck,
    description: "Committee",
    adminOnly: true,
  },
  {
    label: "Check-in",
    href: "/admin/check-in",
    icon: ScanLine,
    description: "QR verify",
  },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  chair: "Society Chair",
};

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
  userRole: string;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  openTriggerRef: React.RefObject<HTMLElement | null>;
}

export function AdminSidebar({
  open,
  onClose,
  userRole,
  theme,
  onThemeToggle,
  openTriggerRef,
}: AdminSidebarProps) {
  const location = useLocation();
  const items = NAV_ITEMS.filter(
    (item) => !item.adminOnly || userRole === "admin",
  );

  const handleLinkClick = () => {
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          onKeyDown={() => {}}
          aria-hidden="true"
        />
      )}

      <aside
        id="primary-sidebar"
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:w-64 lg:translate-x-0",
          open ? "translate-x-0 drawer-slide" : "-translate-x-full",
        )}
      >
        {/* Brand header */}
        <div className="relative flex h-16 items-center justify-center border-b border-sidebar-border px-4">
          <Link to="/" aria-label="IEEE Sahrdaya home" className="inline-flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
              IEEE Admin
            </span>
          </Link>
          <button
            type="button"
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            onClick={onClose}
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
              onClick={onThemeToggle}
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
            {ROLE_LABEL[userRole] ?? "Unknown role"}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.href ||
                (item.href !== "/" &&
                  location.pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={handleLinkClick}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive
                          ? "text-primary"
                          : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70",
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="h-3 w-3 text-primary" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer — sign out */}
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => {
              fetch("/api/auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              }).finally(() => {
                window.location.href = "/";
              });
            }}
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

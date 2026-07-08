import {
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  Gift,
  LayoutDashboard,
  LogOut,
  Moon,
  ScanLine,
  Settings,
  Sun,
  Trophy,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  allowedRoles: ("admin" | "chair" | "content")[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    description: "Event pulse",
    allowedRoles: ["admin", "chair"],
  },
  {
    label: "Events",
    href: "/admin/events",
    icon: Calendar,
    description: "Manage events",
    allowedRoles: ["admin", "chair"],
  },
  {
    label: "Registrations",
    href: "/admin/registrations",
    icon: ClipboardList,
    description: "Sign-ups & check-ins",
    allowedRoles: ["admin", "chair"],
  },
  {
    label: "Check-in",
    href: "/admin/check-in",
    icon: ScanLine,
    description: "QR verify",
    allowedRoles: ["admin", "chair"],
  },
  {
    label: "Societies",
    href: "/admin/societies",
    icon: Building2,
    description: "Chapters",
    allowedRoles: ["admin"],
  },
  {
    label: "Blogs",
    href: "/admin/blogs/",
    icon: FileText,
    description: "Manage posts",
    allowedRoles: ["admin", "content"],
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    description: "Roles",
    allowedRoles: ["admin"],
  },
  {
    label: "Execom",
    href: "/admin/execom",
    icon: UserCheck,
    description: "Committee",
    allowedRoles: ["admin"],
  },
  {
    label: "FIFA Matches",
    href: "/admin/FIFA/matches/",
    icon: Trophy,
    description: "WC Predict '26",
    allowedRoles: ["admin"],
  },
  {
    label: "FIFA Testing",
    href: "/admin/FIFA/testing/",
    icon: FlaskConical,
    description: "Game console",
    allowedRoles: ["admin"],
  },
  {
    label: "FIFA Settings",
    href: "/admin/FIFA/settings/",
    icon: Settings,
    description: "Economy + raffle",
    allowedRoles: ["admin"],
  },
  {
    label: "FIFA Raffle",
    href: "/admin/FIFA/raffle/",
    icon: Gift,
    description: "Draw winner",
    allowedRoles: ["admin"],
  },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  chair: "Society Chair",
  content: "Content Team",
};

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
  userRole: string;
  userEmail?: string;
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function AdminSidebar({
  open,
  onClose,
  userRole,
  userEmail,
  theme,
  onThemeToggle,
}: AdminSidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  const items = NAV_ITEMS.filter(
    (item) => item.allowedRoles.includes(userRole as any),
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden vh-safe-top"
          onClick={onClose}
          aria-label="Close sidebar overlay"
        />
      )}

      <aside
        id="primary-sidebar"
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground drawer-slide lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand header — wordmark + emblem (sidebar is dark in both
            light and dark mode; invert the emblem so it reads on dark). */}
        <div className="relative flex h-16 items-center justify-center border-b border-sidebar-border px-4 vh-safe-top">
          <Link
            to="/"
            onClick={onClose}
            className="inline-flex items-center gap-2.5"
            aria-label="IEEE Sahrdaya home"
          >
            <img
              src="/emblem.png"
              alt=""
              aria-hidden="true"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
                IEEE Sahrdaya
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/50">
                Admin Console
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="vh-touch absolute right-4 flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
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
              className="vh-touch flex h-8 w-8 items-center justify-center rounded-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
          {userEmail && (
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {userEmail}
            </p>
          )}
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
                    onClick={onClose}
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
            onClick={signOut}
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

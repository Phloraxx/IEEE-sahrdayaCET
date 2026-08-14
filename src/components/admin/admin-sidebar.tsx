import {
  Building2, Calendar, ChevronRight, ClipboardList, FileText, LayoutDashboard,
  LogOut, Moon, ScanLine, Settings, Sun, Ticket, Trophy, UserCheck, Users,
  WalletCards, ShieldCheck, X,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type AdminRole = "admin" | "chair" | "content";
interface NavItem { label: string; href: string; icon: React.ComponentType<{ className?: string }>; roles: AdminRole[] }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  { label: "Operate", items: [
    { label: "Operations Home", href: "/admin/dashboard", icon: LayoutDashboard, roles: ["admin", "chair"] },
    { label: "Events", href: "/admin/events", icon: Calendar, roles: ["admin", "chair"] },
    { label: "Registrations", href: "/admin/registrations", icon: ClipboardList, roles: ["admin", "chair"] },
    { label: "Payments", href: "/admin/payments", icon: WalletCards, roles: ["admin"] },
    { label: "Check-in", href: "/admin/check-in", icon: ScanLine, roles: ["admin", "chair"] },
    { label: "Data Health", href: "/admin/data-health", icon: ShieldCheck, roles: ["admin"] },
  ]},
  { label: "Organisation", items: [
    { label: "Societies", href: "/admin/societies", icon: Building2, roles: ["admin", "chair"] },
    { label: "Users & Access", href: "/admin/users", icon: Users, roles: ["admin"] },
    { label: "Execom", href: "/admin/execom", icon: UserCheck, roles: ["admin"] },
  ]},
  { label: "Content", items: [
    { label: "Blogs", href: "/admin/blogs", icon: FileText, roles: ["admin", "content"] },
  ]},
  { label: "Special Projects", items: [
    { label: "FIFA Matches", href: "/admin/FIFA/matches", icon: Trophy, roles: ["admin"] },
    { label: "FIFA Settings", href: "/admin/FIFA/settings", icon: Settings, roles: ["admin"] },
    { label: "FIFA Raffle", href: "/admin/FIFA/raffle", icon: Ticket, roles: ["admin"] },
  ]},
];

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", chair: "Society Chair", content: "Content Team" };

interface AdminSidebarProps {
  open: boolean; onClose: () => void; userRole: string; userEmail?: string;
  theme: "light" | "dark"; onThemeToggle: () => void;
}

export function AdminSidebar({ open, onClose, userRole, userEmail, theme, onThemeToggle }: AdminSidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  const role = userRole as AdminRole;
  return <>
    {open && <button type="button" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden vh-safe-top" onClick={onClose} aria-label="Close sidebar overlay" />}
    <aside id="primary-sidebar" aria-label="Admin navigation" className={cn(
      "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground drawer-slide lg:w-64 lg:translate-x-0",
      open ? "translate-x-0" : "-translate-x-full",
    )}>
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4 vh-safe-top">
        <Link to="/" onClick={onClose} className="inline-flex items-center gap-2.5" aria-label="IEEE Sahrdaya home">
          <img src="/emblem.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
          <div className="leading-tight"><div className="text-[13px] font-semibold">IEEE Sahrdaya</div><div className="text-[10px] text-sidebar-foreground/45">Admin</div></div>
        </Link>
        <button type="button" className="vh-touch flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={onClose} aria-label="Close sidebar"><X className="h-4 w-4" /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => item.roles.includes(role));
            if (!items.length) return null;
            return <section key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/35">{group.label}</p>
              <ul className="space-y-0.5">{items.map((item) => {
                const Icon = item.icon;
                const href = item.href.replace(/\/$/, "");
                const path = location.pathname.replace(/\/$/, "");
                const active = path === href || path.startsWith(`${href}/`);
                return <li key={item.href}><Link to={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}>
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
                  <span className="flex-1 truncate">{item.label}</span>{active && <ChevronRight className="h-3 w-3 text-primary" />}
                </Link></li>;
              })}</ul>
            </section>;
          })}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{ROLE_LABEL[userRole] ?? "Admin"}</div>{userEmail && <div className="truncate text-[11px] text-sidebar-foreground/45">{userEmail}</div>}</div>
          <button type="button" onClick={onThemeToggle} className="vh-touch flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
        </div>
        <button type="button" onClick={signOut} className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </aside>
  </>;
}

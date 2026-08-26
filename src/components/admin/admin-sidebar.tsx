import {
  Building2, Calendar, ChevronRight, ClipboardList, FileText, KeyRound, LayoutDashboard,
  LogOut, Moon, ScanLine, Settings, Sun, Ticket, Trophy, UserCheck, Users,
  WalletCards, ShieldCheck, X,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { WorkspaceCapability, WorkspaceMe } from "@/lib/workspace-permissions";
import { roleLabel } from "@/lib/workspace-permissions";

type IconType = React.ComponentType<{ className?: string }>;
interface NavItem {
  label: string;
  href: string;
  icon: IconType;
  capability?: WorkspaceCapability;
  branchOnly?: boolean;
  platformAdminOnly?: boolean;
}
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  { label: "Operate", items: [
    { label: "Operations Home", href: "/admin/dashboard", icon: LayoutDashboard, capability: "registrations.view" },
    { label: "Events", href: "/admin/events", icon: Calendar, capability: "events.view" },
    { label: "Registrations", href: "/admin/registrations", icon: ClipboardList, capability: "registrations.view" },
    { label: "Payments", href: "/admin/payments", icon: WalletCards, capability: "finance.view", branchOnly: true },
    { label: "Check-in", href: "/admin/check-in", icon: ScanLine, capability: "checkin.manage" },
    { label: "Data Health", href: "/admin/data-health", icon: ShieldCheck, capability: "technical.manage", branchOnly: true },
  ]},
  { label: "Organisation", items: [
    { label: "Societies", href: "/admin/societies", icon: Building2, capability: "societies.view" },
    { label: "Access & Roles", href: "/admin/access", icon: KeyRound, capability: "assignments.manage" },
    { label: "Users", href: "/admin/users", icon: Users, platformAdminOnly: true },
    { label: "Execom", href: "/admin/execom", icon: UserCheck, platformAdminOnly: true },
  ]},
  { label: "Content", items: [
    { label: "Blogs", href: "/admin/blogs", icon: FileText, capability: "content.manage" },
  ]},
  { label: "Special Projects", items: [
    { label: "FIFA Matches", href: "/admin/FIFA/matches", icon: Trophy, capability: "technical.manage", branchOnly: true },
    { label: "FIFA Settings", href: "/admin/FIFA/settings", icon: Settings, capability: "technical.manage", branchOnly: true },
    { label: "FIFA Raffle", href: "/admin/FIFA/raffle", icon: Ticket, capability: "technical.manage", branchOnly: true },
  ]},
];

function visible(item: NavItem, workspace: WorkspaceMe, legacyRole: string): boolean {
  if (item.platformAdminOnly) return legacyRole === "admin";
  if (!item.capability) return false;
  const source = item.branchOnly ? workspace.branchCapabilities : workspace.capabilities;
  return source.includes(item.capability);
}

function workspaceTitle(workspace: WorkspaceMe, legacyRole: string): string {
  if (legacyRole === "admin") return "Platform Administrator";
  const assignment = workspace.assignments.find((item) => item.active);
  if (assignment) return assignment.title || roleLabel(assignment.roleCode);
  if (legacyRole === "chair") return "Society Chair · legacy";
  if (legacyRole === "content") return "Content Team · legacy";
  return "Workspace member";
}

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
  userRole: string;
  userEmail?: string;
  workspace: WorkspaceMe;
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function AdminSidebar({ open, onClose, userRole, userEmail, workspace, theme, onThemeToggle }: AdminSidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  return <>
    {open && <button type="button" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden vh-safe-top" onClick={onClose} aria-label="Close sidebar overlay" />}
    <aside id="primary-sidebar" aria-label="IEEE Workspace navigation" className={cn(
      "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground drawer-slide lg:w-64 lg:translate-x-0",
      open ? "translate-x-0" : "-translate-x-full",
    )}>
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4 vh-safe-top">
        <Link to="/" onClick={onClose} className="inline-flex items-center gap-2.5" aria-label="IEEE Sahrdaya home">
          <img src="/emblem.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
          <div className="leading-tight"><div className="text-[13px] font-semibold">IEEE Sahrdaya</div><div className="text-[10px] text-sidebar-foreground/45">Workspace</div></div>
        </Link>
        <button type="button" className="vh-touch flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={onClose} aria-label="Close sidebar"><X className="h-4 w-4" /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => visible(item, workspace, userRole));
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
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{workspaceTitle(workspace, userRole)}</div>{userEmail && <div className="truncate text-[11px] text-sidebar-foreground/45">{userEmail}</div>}</div>
          <button type="button" onClick={onThemeToggle} className="vh-touch flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
        </div>
        <button type="button" onClick={signOut} className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </aside>
  </>;
}

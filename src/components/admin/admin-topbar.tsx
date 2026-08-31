import { useEffect, useMemo, useState } from "react";
import { Menu, Plus, Search } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import type { WorkspaceMe } from "@/lib/workspace-permissions";

interface AdminTopbarProps { onOpenSidebar: (e: React.MouseEvent<HTMLElement>) => void; sidebarOpen: boolean; isNavigating: boolean; workspace: WorkspaceMe; }
const LABELS: [string, string][] = [
  ["/admin/dashboard", "Operations Home"], ["/admin/events", "Events"], ["/admin/registrations", "Registrations"],
  ["/admin/payments", "Payments"], ["/admin/certificates", "Certificates"], ["/admin/check-in", "Check-in"], ["/admin/data-health", "Data Health"], ["/admin/societies", "Societies"],
  ["/admin/access", "Access & Roles"], ["/admin/users", "Users"], ["/admin/execom", "Execom"], ["/admin/blogs", "Blogs"], ["/admin/FIFA", "FIFA"],
];

export function AdminTopbar({ onOpenSidebar, sidebarOpen, isNavigating, workspace }: AdminTopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("WORKSPACE");
  useEffect(() => {
    const host = window.location.hostname;
    setEnvironment(host.startsWith("staging.") ? "STAGING" : host === "ieeesahrdaya.com" || host === "www.ieeesahrdaya.com" ? "PRODUCTION" : "LOCAL");
  }, []);
  const page = useMemo(() => LABELS.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))?.[1] ?? "Workspace", [location.pathname]);
  const search = (e: React.FormEvent) => { e.preventDefault(); const value = query.trim(); if (value) navigate(`/admin/registrations?search=${encodeURIComponent(value)}`); };
  return <>
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:h-16 lg:px-6 vh-safe-top">
      <button type="button" className="vh-touch flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden" onClick={onOpenSidebar} aria-label="Open sidebar" aria-expanded={sidebarOpen} aria-controls="primary-sidebar"><Menu className="h-4 w-4" /></button>
      <div className="min-w-0"><div className="truncate text-sm font-semibold tracking-tight">{page}</div></div>
      <span className={cn("hidden rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider sm:inline-flex", environment === "PRODUCTION" ? "border-destructive/30 text-destructive" : "border-primary/25 text-primary")}>{environment}</span>
      {workspace.capabilities.includes("registrations.view") ? <form onSubmit={search} className="ml-auto hidden w-full max-w-sm md:block"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full rounded-md border border-border bg-muted/25 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-background" placeholder="Search attendee, email, phone or ticket…" aria-label="Search registrations" /></div></form> : <div className="ml-auto" />}
      {workspace.capabilities.includes("events.create") && <Link to="/admin/events/new" className="hidden h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 sm:inline-flex"><Plus className="h-3.5 w-3.5" />New event</Link>}
    </header>
    <div className={cn("fixed inset-x-0 top-0 z-50 h-0.5 bg-primary/15 transition-opacity duration-300 lg:left-64", isNavigating ? "opacity-100" : "opacity-0")} aria-hidden="true"><div className="loading-bar-fill h-full w-1/3 bg-primary" /></div>
  </>;
}

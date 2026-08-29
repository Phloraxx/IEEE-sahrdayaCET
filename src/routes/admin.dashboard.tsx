import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BellRing, CalendarDays, CircleDollarSign, ClipboardList, ScanLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminStats, type AdminStats } from "@/lib/data/admin-stats.client";
import { formatDateTime } from "@/lib/dates";

function DashboardSkeleton() { return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-52 w-full" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>; }
function humanAction(value: string) { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function AdminDashboard() {
  const { data: stats, isLoading, isError, error } = useQuery<AdminStats>({ queryKey: ["admin-stats"], queryFn: getAdminStats, retry: 1, staleTime: 20_000 });
  if (isLoading) return <DashboardSkeleton />;
  if (isError || !stats) return <Card className="border-destructive/40"><CardContent className="p-6"><h2 className="font-semibold">Operations data unavailable</h2><p className="mt-1 text-sm text-muted-foreground">{(error as Error)?.message ?? "Could not load admin data."}</p></CardContent></Card>;

  const attention = [
    { label: "Stale pending payments", count: stats.attention.stalePending, description: "Pending for longer than the normal 10-minute payment grace window.", href: "/admin/registrations?attention=1", icon: CircleDollarSign },
    { label: "Paid registrations needing resolution", count: stats.attention.cancelledPaid, description: "Payment is recorded but the seat is cancelled. Review before taking another action.", href: "/admin/registrations?status=cancelled&payment=paid", icon: AlertTriangle },
    { label: "Failed notifications", count: stats.attention.failedNotifications, description: "Ticket, receipt, or certificate email delivery ended in a failed state.", href: "/admin/registrations", icon: BellRing },
  ];
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  return <div className="space-y-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium text-muted-foreground">Operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">What needs attention now</h1><p className="mt-1 text-sm text-muted-foreground">Exceptions first. Aggregate numbers are secondary.</p></div>
      <div className="flex gap-2"><Link to="/admin/check-in" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"><ScanLine className="h-3.5 w-3.5" />Check-in</Link><Link to="/admin/registrations" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"><ClipboardList className="h-3.5 w-3.5" />Registration queue</Link></div>
    </div>

    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5"><div><h2 className="text-sm font-semibold">Attention queue</h2><p className="text-xs text-muted-foreground">{attentionTotal ? `${attentionTotal} item${attentionTotal === 1 ? "" : "s"} need review` : "No operational exceptions right now"}</p></div><span className={attentionTotal ? "font-mono text-sm font-semibold text-warning" : "font-mono text-sm font-semibold text-success"}>{attentionTotal}</span></div>
      <div className="divide-y divide-border">{attention.map((item) => { const Icon = item.icon; return <Link key={item.label} to={item.href} className="group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5"><Icon className={item.count ? "mt-0.5 h-4 w-4 text-warning" : "mt-0.5 h-4 w-4 text-muted-foreground/35"} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{item.label}</span><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{item.count}</span></div><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.description}</p></div><ArrowRight className="mt-1 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></Link>; })}</div>
    </section>

    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5"><div><h2 className="text-sm font-semibold">Live & upcoming events</h2><p className="text-xs text-muted-foreground">Next operational workspaces</p></div><CalendarDays className="h-4 w-4 text-muted-foreground" /></div>
        {stats.upcomingEvents.length ? <div className="divide-y divide-border">{stats.upcomingEvents.map((event) => <Link key={event.id} to={`/admin/events/${event.id}`} className="grid gap-2 px-4 py-3.5 hover:bg-muted/35 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="truncate text-sm font-medium">{event.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(event.date)}</div></div><div className="flex items-center gap-3 text-xs"><span className="font-mono tabular-nums">{event.registeredCount}{event.maxCapacity > 0 ? ` / ${event.maxCapacity}` : ""}</span><span className="text-muted-foreground">registrations</span></div></Link>)}</div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No live or upcoming published events.</div>}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 sm:px-5"><h2 className="text-sm font-semibold">Recent admin activity</h2><p className="text-xs text-muted-foreground">Latest audited operations</p></div>
        {stats.recentActivity.length ? <div className="divide-y divide-border">{stats.recentActivity.map((activity) => <div key={activity.id} className="px-4 py-3 sm:px-5"><div className="text-xs font-medium">{humanAction(activity.action)}</div><div className="mt-1 text-[11px] leading-4 text-muted-foreground">{activity.actorName}{activity.eventTitle ? ` · ${activity.eventTitle}` : ""}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{formatDateTime(activity.created)}</div></div>)}</div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No audit activity yet.</div>}
      </section>
    </div>

    <section><div className="mb-2 text-xs font-medium text-muted-foreground">At a glance</div><div className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4"><div className="border-b border-border p-4 sm:border-r lg:border-b-0"><div className="text-xs text-muted-foreground">Events</div><div className="mt-1 font-mono text-xl font-semibold">{stats.events.total}</div><div className="mt-1 text-[11px] text-muted-foreground">{stats.events.live} live · {stats.events.upcoming} upcoming</div></div><div className="border-b border-border p-4 lg:border-b-0 lg:border-r"><div className="text-xs text-muted-foreground">Registrations</div><div className="mt-1 font-mono text-xl font-semibold">{stats.registrations.total}</div><div className="mt-1 text-[11px] text-muted-foreground">{stats.registrations.today} today</div></div><div className="border-b border-border p-4 sm:border-b-0 sm:border-r"><div className="text-xs text-muted-foreground">Confirmed</div><div className="mt-1 font-mono text-xl font-semibold">{stats.registrations.confirmed}</div><div className="mt-1 text-[11px] text-muted-foreground">{stats.registrations.pending} pending</div></div><div className="p-4"><div className="text-xs text-muted-foreground">Published events</div><div className="mt-1 font-mono text-xl font-semibold">{stats.events.published}</div><div className="mt-1 text-[11px] text-muted-foreground">Current catalogue</div></div></div></section>
  </div>;
}

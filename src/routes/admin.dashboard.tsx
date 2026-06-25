import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ClipboardList,
  Building2,
  Users,
  ArrowRight,
  UserCheck,
  ScanLine,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">Error</p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{error?.message ?? "Something went wrong"}</h1>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Try again</button>
      </div>
    </div>
  ),
});

interface StatsResponse {
  events: {
    total: number;
    published: number;
    upcoming: number;
    live: number;
    recentlyCompleted: number;
  };
  registrations: {
    total: number;
    confirmed: number;
    pending: number;
    today: number;
  };
  execom: { total: number };
  societies: { total: number; active: number };
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[120px] rounded-lg" />
      ))}
    </div>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const QUICK_ACTIONS = [
    { label: "Events", href: "/admin/events", icon: Calendar, description: "Create and manage events" },
    { label: "Registrations", href: "/admin/registrations", icon: ClipboardList, description: "View sign-ups and check-ins" },
    { label: "Users", href: "/admin/users", icon: Users, description: "Manage member roles" },
    { label: "Check-in", href: "/admin/check-in", icon: ScanLine, description: "Verify QR tickets" },
  ];

  // Registration pipeline data for the stacked bar
  const pipeline = stats
    ? [
        { label: "Confirmed", count: stats.registrations.confirmed, color: "bg-success" },
        { label: "Pending", count: stats.registrations.pending, color: "bg-warning" },
      ].filter((s) => s.count > 0)
    : [];
  const pipelineTotal = pipeline.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* ── Hero strip ─────────────────────────────────────── */}
      <Card className="relative overflow-hidden border-border bg-card">
        <CardContent className="flex items-center justify-between gap-6 p-6">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              IEEE Sahrdaya · Admin
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {stats
                ? stats.events.live > 0
                  ? `${stats.events.live} event${stats.events.live !== 1 ? "s" : ""} live right now.`
                  : stats.events.upcoming > 0
                    ? `${stats.events.upcoming} upcoming event${stats.events.upcoming !== 1 ? "s" : ""}.`
                    : "Welcome back."
                : "Welcome back."}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {stats
                ? `${stats.registrations.total} total registrations across ${stats.events.total} events.`
                : "Loading dashboard…"}
            </p>
          </div>
          <Link
            to="/admin/events"
            className="hidden shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
          >
            View events
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      {/* ── Metric cards ───────────────────────────────────── */}
      {isLoading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Events"
            value={stats.events.total}
            context={`${stats.events.upcoming} upcoming · ${stats.events.published} published`}
            icon={Calendar}
            tone="primary"
          />
          <MetricCard
            label="Registrations"
            value={stats.registrations.total}
            context={`${stats.registrations.confirmed} confirmed · ${stats.registrations.today} today`}
            icon={ClipboardList}
            tone="success"
          />
          <MetricCard
            label="Societies"
            value={stats.societies.total}
            context={`${stats.societies.active} active`}
            icon={Building2}
          />
          <MetricCard
            label="Users"
            value={stats.execom.total}
            context="Execom members"
            icon={UserCheck}
          />
        </div>
      ) : null}

      {/* ── Pipeline / Registration status ─────────────────── */}
      {stats && pipeline.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Pipeline
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Registration status
                </h2>
                <p className="text-xs text-muted-foreground">
                  {pipelineTotal} total across all events
                </p>
              </div>
              <Link
                to="/admin/registrations"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            </div>

            {/* Stacked bar */}
            <div className="mb-3 flex h-8 overflow-hidden rounded-md">
              {pipeline.map((segment) => (
                <div
                  key={segment.label}
                  className={`${segment.color} transition-all`}
                  style={{
                    width: `${pipelineTotal > 0 ? (segment.count / pipelineTotal) * 100 : 0}%`,
                  }}
                  title={`${segment.label}: ${segment.count}`}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {pipeline.map((segment) => (
                <div key={segment.label} className="flex items-center gap-1.5 text-xs">
                  <span className={`inline-block h-2 w-2 rounded-full ${segment.color}`} />
                  <span className="text-muted-foreground">{segment.label}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {segment.count}
                  </span>
                  <span className="text-muted-foreground/60">
                    {pipelineTotal > 0
                      ? `${Math.round((segment.count / pipelineTotal) * 100)}%`
                      : "0%"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quick actions ──────────────────────────────────── */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Quick actions
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} to={action.href}>
                <Card className="group h-full transition-colors hover:border-foreground/15">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {action.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

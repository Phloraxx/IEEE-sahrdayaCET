import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ClipboardList,
  Building2,
  Users,
  ArrowRight,
  TrendingUp,
  UserCheck,
  ScanLine,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metric-card";
import { PanelHeader } from "@/components/admin/panel-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">Error</p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{error?.message ?? "Something went wrong"}</h1>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
          Try again
        </button>
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
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const QUICK_ACTIONS = [
    {
      label: "Events",
      href: "/admin/events",
      icon: Calendar,
      description: "Create and manage events",
    },
    {
      label: "Registrations",
      href: "/admin/registrations",
      icon: ClipboardList,
      description: "View sign-ups and check-ins",
    },
    {
      label: "Users",
      href: "/admin/users",
      icon: Users,
      description: "Manage member roles",
    },
    {
      label: "Check-in",
      href: "/admin/check-in",
      icon: ScanLine,
      description: "Verify QR tickets",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Hero strip */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          Admin Console
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your IEEE student branch activity.
        </p>
      </div>

      {/* Metric cards */}
      {isLoading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Events"
            value={stats.events.total}
            context={`${stats.events.upcoming} upcoming · ${stats.events.live} live`}
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
            label="Execom Members"
            value={stats.execom.total}
            icon={UserCheck}
          />
        </div>
      ) : null}

      {/* Quick actions */}
      <div>
        <PanelHeader
          eyebrow="Quick actions"
          title="Management"
          description="Jump to a section."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} to={action.href}>
                <Card className="group h-full transition-colors hover:border-foreground/15">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {action.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Trend summary */}
      {stats && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-success" />
            <span>
              {stats.events.recentlyCompleted} event
              {stats.events.recentlyCompleted !== 1 ? "s" : ""} completed
              recently · {stats.registrations.pending} registration
              {stats.registrations.pending !== 1 ? "s" : ""} pending review
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

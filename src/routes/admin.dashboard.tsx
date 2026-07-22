import { Link, redirect } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Calendar,
  ClipboardList,
  ScanLine,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metric-card";
import { PanelHeader } from "@/components/admin/panel-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-[180px] w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[200px] w-full rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[160px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load stats (${res.status})`);
      }
      return res.json();
    },
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !stats) {
    return (
      <Card variant="elevated" className="border-destructive/40">
        <CardContent className="p-6">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-destructive">
            Stats unavailable
          </p>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            Could not load dashboard data
          </h2>
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ??
              "Check that you are signed in as an admin or chair."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Pipeline — confirmed + pending + cancelled when present
  const pipeline = [
    {
      key: "confirmed",
      label: "Confirmed",
      count: stats.registrations.confirmed,
      dot: "bg-success",
    },
    {
      key: "pending",
      label: "Pending",
      count: stats.registrations.pending,
      dot: "bg-warning",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      count: stats.registrations.total - stats.registrations.confirmed - stats.registrations.pending,
      dot: "bg-destructive",
    },
  ].filter((s) => s.count > 0);
  const pipelineTotal = stats.registrations.total;

  const liveOrUpcomingHeading = stats.events.live > 0
    ? `${stats.events.live} event${stats.events.live !== 1 ? "s" : ""} live right now.`
    : stats.events.upcoming > 0
      ? `${stats.events.upcoming} upcoming event${stats.events.upcoming !== 1 ? "s" : ""}.`
      : stats.events.total > 0
        ? "Quiet right now — nothing live."
        : "No events yet.";

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------------------
          HERO STRIP — IEEE Sahrdaya Admin · mission title + live signal
          ------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-card">
        <div className="vh-grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
        <div
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-60 vh-wash-tr"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div className="space-y-3 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
              IEEE Sahrdaya · Admin
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {liveOrUpcomingHeading}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {stats.registrations.total} total registration
              {stats.registrations.total !== 1 ? "s" : ""} across {stats.events.total} event
              {stats.events.total !== 1 ? "s" : ""}.{" "}
              {stats.registrations.today > 0
                ? `${stats.registrations.today} today.`
                : "Nothing new today."}
            </p>
          </div>
          <Link
            to="/admin/registrations"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
          >
            Open registration queue
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------
          STATS — 4 compact metric cards
          ------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-cards">
        <MetricCard
          label="Events"
          value={stats.events.total}
          icon={Calendar}
          context={`${stats.events.upcoming} upcoming · ${stats.events.published} published`}
        />
        <MetricCard
          label="Registrations"
          value={stats.registrations.total}
          icon={ClipboardList}
          tone="info"
          context={`${stats.registrations.confirmed} confirmed · ${stats.registrations.today} today`}
        />
        <MetricCard
          label="Societies"
          value={stats.societies.total}
          icon={Building2}
          context={
            stats.societies.total > 0
              ? `${stats.societies.active} active`
              : "—"
          }
        />
        <MetricCard
          label="Execom"
          value={stats.execom.total}
          icon={UserCheck}
          context="Committee members"
        />
      </div>

      {/* ------------------------------------------------------------
          PIPELINE — registration state distribution
          ------------------------------------------------------------ */}
      {pipelineTotal > 0 && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader
              eyebrow="Pipeline"
              title="Where registrations are"
              description={`${pipelineTotal} total across all events.`}
              actions={
                <Link
                  to="/admin/registrations"
                  className="inline-flex h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all registrations
                  <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />

            {/* Stacked bar */}
            <div className="flex h-10 w-full overflow-hidden rounded-md border border-border">
              {pipeline.map((segment) => {
                const pct = (segment.count / pipelineTotal) * 100;
                if (pct < 1) return null;
                return (
                  <div
                    key={segment.key}
                    className={`${segment.dot} flex items-center justify-center text-[10px] font-bold text-white transition-all`}
                    style={{
                      width: `${pct}%`,
                      minWidth: pct > 5 ? "3rem" : undefined,
                    }}
                    title={`${segment.label}: ${segment.count} (${pct.toFixed(1)}%)`}
                  >
                    {pct > 8 ? segment.count : ""}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pipeline.map((segment) => {
                const pct = ((segment.count / pipelineTotal) * 100).toFixed(1);
                return (
                  <Link
                    key={segment.key}
                    to="/admin/registrations"
                    search={{ status: segment.key }}
                    className="group flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${segment.dot}`} />
                      <span className="truncate text-xs text-muted-foreground group-hover:text-foreground">
                        {segment.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 shrink-0">
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {segment.count}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------
          QUICK ACTIONS — large card surface, 2x2 grid
          ------------------------------------------------------------ */}
      <div>
        <PanelHeader
          eyebrow="Operations"
          title="Where to next"
          description="The surfaces you'll touch most as an organizer."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/admin/events" className="group block focus-visible:outline-none">
            <Card variant="elevated" className="h-full card-hover">
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                      Event queue
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight">All events</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Create, edit, and manage {stats.events.total} event
                      {stats.events.total !== 1 ? "s" : ""}.
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="font-mono tabular-nums text-2xl font-semibold">
                    {stats.events.total}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    Open events
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link
            to="/admin/registrations"
            className="group block focus-visible:outline-none"
          >
            <Card variant="elevated" className="h-full card-hover">
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                      Sign-ups
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Registrations
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Review, check in, and cancel {stats.registrations.total}{" "}
                      registration{stats.registrations.total !== 1 ? "s" : ""}.
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="font-mono tabular-nums text-2xl font-semibold">
                    {stats.registrations.total}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    View queue
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/admin/societies" className="group block focus-visible:outline-none">
            <Card variant="elevated" className="h-full card-hover">
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                      Chapters
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Societies
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Manage {stats.societies.total} IEEE societ
                      {stats.societies.total !== 1 ? "ies" : "y"} and their chairs.
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="font-mono tabular-nums text-2xl font-semibold">
                    {stats.societies.total}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    Open societies
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/admin/check-in" className="group block focus-visible:outline-none">
            <Card variant="elevated" className="h-full card-hover">
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                      On-site
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight">Check-in</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Verify tickets at the door and mark attendees present.
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <ScanLine className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="font-mono tabular-nums text-2xl font-semibold">
                    QR
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    Start check-in
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------
          PEOPLE — extra row pinned to the bottom (admin-only signal)
          ------------------------------------------------------------ */}
      <div>
        <PanelHeader
          eyebrow="People"
          title="Members"
          description="Users registered on the platform and committee members."
        />
        <div className="grid gap-4 md:grid-cols-2 stagger-cards">
          <Link to="/admin/users" className="group block focus-visible:outline-none">
            <Card variant="elevated" className="card-hover">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Users</p>
                    <p className="text-xs text-muted-foreground">Manage member roles</p>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/admin/execom" className="group block focus-visible:outline-none">
            <Card variant="elevated" className="card-hover">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 shrink-0">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Execom</p>
                    <p className="text-xs text-muted-foreground">
                      {stats.execom.total} member
                      {stats.execom.total !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

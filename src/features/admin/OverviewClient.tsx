import {
  ArrowUpRight,
  CalendarPlus,
  CalendarDays,
  Users,
  Building2,
  UserPlus,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardHeader,

} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDateShort } from "@/lib/dates";
import type {
  DashboardStats,
  DashboardUpcomingEvent,
  DashboardRecentRegistration,
} from "@/routes/admin.index";

// ─── Types ──────────────────────────────────────────────

interface DailyCount {
  date: string;
  count: number;
}

interface PaymentBucket {
  name: string;
  value: number;
  fill: string;
}

interface Props {
  stats: DashboardStats | null;
  upcoming: DashboardUpcomingEvent[];
  recent: DashboardRecentRegistration[];
  dailyRegistrations: DailyCount[];
  paymentDistribution: PaymentBucket[];
  userName?: string;
  userRole?: string;
}

// ─── Greeting helper ────────────────────────────────────

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", emoji: "🌅" };
  if (hour < 17) return { text: "Good afternoon", emoji: "☀️" };
  if (hour < 21) return { text: "Good evening", emoji: "🌆" };
  return { text: "Working late", emoji: "🌙" };
}

// ─── Helpers ──────────────────────────────────────────

function statusBadgeVariant(status: string) {
  switch (status) {
    case "confirmed":
    case "paid":
      return "default" as const;
    case "pending":
      return "secondary" as const;
    case "cancelled":
    case "failed":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function formatRelativeTime(dateStr: string) {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return `${days}d ago`;
}

// ─── Panel Header ────────────────────────────────────────

function PanelHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────

function MetricCard({
  label,
  value,
  context,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  context: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 relative">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{context}</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────

export function OverviewClient({
  stats,
  upcoming,
  recent,
  dailyRegistrations,
  paymentDistribution,
  userName,
  userRole,
}: Props) {
  if (!stats) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Failed to load dashboard data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasChartData =
    dailyRegistrations.length > 0 &&
    dailyRegistrations.some((d) => d.count > 0);

  // Find the first live or upcoming event for the hero card
  const heroEvent = upcoming.length > 0 ? upcoming[0] : null;

  const { text, emoji } = getGreeting();

  return (
    <div className="space-y-6">
      {/* ── Hero Strip ── */}
      <div className="rounded-lg border border-border bg-card relative overflow-hidden">
        {/* Grid background overlay */}
        <div className="vh-grid-bg absolute inset-0 opacity-40 pointer-events-none" />
        {/* Brand wash */}
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-60 vh-wash-tr pointer-events-none" />
        <div className="relative p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                IEEE SB &middot; Admin
              </p>
              <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
                <span>{emoji}</span>
                <span>
                  {text}
                  {userName ? `, ${userName.split(" ")[0]}` : ""}
                </span>
              </h1>
              <p className="text-sm text-muted-foreground">
                {stats.events.live > 0
                  ? `${stats.events.live} event${stats.events.live > 1 ? "s" : ""} live now \u00b7 `
                  : ""}
                {stats.registrations.total} registration
                {stats.registrations.total !== 1 ? "s" : ""} across{" "}
                {stats.societies.active} active
                society{stats.societies.active > 1 ? "ies" : "y"}
                {stats.registrations.today > 0
                  ? ` \u00b7 ${stats.registrations.today} new today`
                  : ""}
              </p>
            </div>
            <Link
              to="/admin/events/new"
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-4 py-2 text-sm font-medium transition-colors shrink-0"
            >
              <CalendarPlus className="size-4 mr-1.5" />
              Create Event
            </Link>
          </div>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-cards">
        <MetricCard
          label="Total Events"
          value={stats.events.total}
          context={`${stats.events.live} live, ${stats.events.upcoming} upcoming`}
          icon={CalendarDays}
        />
        <MetricCard
          label="Registrations"
          value={stats.registrations.total}
          context={`${stats.registrations.confirmed} confirmed`}
          icon={Users}
        />
        <MetricCard
          label="Active Societies"
          value={stats.societies.active}
          context={`of ${stats.societies.total} total`}
          icon={Building2}
        />
        <MetricCard
          label="Today"
          value={stats.registrations.today}
          context="new sign-ups today"
          icon={UserPlus}
        />
      </div>

      {/* ── Hero Event Card ── */}
      {heroEvent && (
        <div className="rounded-lg border border-border bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {stats.events.live > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      <span className="live-dot" />
                      Live now
                    </span>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      Upcoming
                    </Badge>
                  )}
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {heroEvent.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {formatDateShort(heroEvent.date)}
                  {heroEvent.venue ? ` \u00b7 ${heroEvent.venue}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to="/admin/events/$id"
                  params={{ id: heroEvent.id }}
                  className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-3 py-2 text-xs font-medium transition-colors"
                >
                  View Event
                </Link>
                <Link
                  to="/admin/events/$id/edit"
                  params={{ id: heroEvent.id }}
                  className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
            {(heroEvent.maxCapacity ?? 0) > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Registration progress</span>
                  <span className="tabular-nums">
                    {heroEvent.registeredCount ?? 0}/
                    {heroEvent.maxCapacity ?? 0}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-info transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.min(((heroEvent.registeredCount ?? 0) / (heroEvent.maxCapacity ?? 0)) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </div>
      )}

      {/* ── Charts Row ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bar Chart: Daily Registrations */}
        <Card>
          <CardHeader>
            <PanelHeader
              eyebrow="Analytics"
              title="Registrations (7 days)"
              description="Daily sign-ups over the past week"
            />
          </CardHeader>
          <CardContent>
            {!hasChartData ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No registration data yet
              </div>
            ) : (
              <div className="h-48">
                <ChartContainer
                  config={{
                    registrations: {
                      label: "Registrations",
                      color: "hsl(var(--primary))",
                    },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyRegistrations}>
                      <defs>
                        <linearGradient
                          id="barGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.9}
                          />
                          <stop
                            offset="100%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.3}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{
                          fontSize: 11,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                      />
                      <YAxis hide />
                      <Tooltip
                        content={<ChartTooltipContent />}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar
                        dataKey="count"
                        fill="url(#barGradient)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                        animationDuration={600}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Distribution */}
        <Card>
          <CardHeader>
            <PanelHeader
              eyebrow="Finance"
              title="Payment Status"
              description="Breakdown by payment status"
            />
          </CardHeader>
          <CardContent>
            {!paymentDistribution || paymentDistribution.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No payment data yet
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      animationDuration={600}
                    >
                      {paymentDistribution.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => (
                        <span className="text-xs capitalize">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Upcoming Events ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <PanelHeader
            eyebrow="Schedule"
            title="Upcoming Events"
            description="Next 5 events"
          />
          <Link
            to="/admin/events"
            className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
          >
            View all <ArrowUpRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No upcoming events
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((event) => {
                const pct =
                  (event.maxCapacity ?? 0) > 0
                    ? Math.round(
                        ((event.registeredCount ?? 0) /
                          (event.maxCapacity ?? 0)) *
                          100,
                      )
                    : 0;
                return (
                  <Link
                    key={event.id}
                    to="/admin/events/$id"
                    params={{ id: event.id }}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                        {event.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateShort(event.date)}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-info transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {event.registeredCount}/{event.maxCapacity || "\u221e"}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Registrations ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <PanelHeader
            eyebrow="Users"
            title="Recent Registrations"
            description="Latest 8 sign-ups"
          />
          <Link
            to="/admin/registrations"
            className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
          >
            View all <ArrowUpRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No registrations yet
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((reg) => (
                <Link
                  key={reg.id}
                  to="/admin/registrations/$id"
                  params={{ id: reg.id }}
                  className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {reg.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                        {reg.userName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {reg.userEmail}
                      </p>
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <Badge
                      variant={statusBadgeVariant(reg.registrationStatus)}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {reg.registrationStatus}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatRelativeTime(reg.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

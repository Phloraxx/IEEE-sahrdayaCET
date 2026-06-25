import { ArrowUpRight, CalendarPlus } from "lucide-react";
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
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate, formatDateShort } from "@/lib/dates";
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


// ─── Greeting ──────────────────────────────────────────

function GreetingSection({ name, role }: { name?: string; role?: string }) {
  const { text, emoji } = getGreeting();
  const today = formatDate(new Date().toISOString());

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span>{emoji}</span>
          <span>
            {text}
            {name ? `, ${name.split(" ")[0]}` : ""}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>
      <div className="flex items-center gap-2">
        {role === "chair" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ieee-blue/10 px-2.5 py-0.5 text-xs font-medium text-ieee-blue">
            <span className="size-1.5 rounded-full bg-ieee-blue" />
            Chair
          </span>
        )}
        <Link
          to="/admin/events/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-3 py-1.5 text-xs font-medium transition-all"
        >
          <CalendarPlus className="size-3.5 mr-1" />
          Create Event
        </Link>
      </div>
    </div>
  );
}

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
        <GreetingSection name={userName} role={userRole} />
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

  return (
    <div className="space-y-6">
      {/* ── Greeting ── */}
      <GreetingSection name={userName} role={userRole} />

      {/* ── Hero Event Card ── */}
      {heroEvent && (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 delay-100">
          <Card className="relative overflow-hidden border-ieee-blue/10">
            <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-ieee-blue/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <CardContent className="p-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {stats.events.live > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ieee-success/10 px-2 py-0.5 text-[10px] font-medium text-ieee-success">
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
                  <h2 className="text-xl font-bold tracking-tight">
                    {heroEvent.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDateShort(heroEvent.date)}
                    {heroEvent.venue ? ` · ${heroEvent.venue}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/admin/events/$id" params={{ id: heroEvent.id }}
                    className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-3 py-2 text-xs font-medium transition-all"
                  >
                    View Event
                  </Link>
                  <Link
                    to="/admin/events/$id/edit" params={{ id: heroEvent.id }}
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
                      {heroEvent.registeredCount ?? 0}/{heroEvent.maxCapacity ?? 0}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-ieee-blue to-ieee-light-blue transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(((heroEvent.registeredCount ?? 0) / (heroEvent.maxCapacity ?? 0)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Charts Row ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bar Chart: Daily Registrations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrations (7 days)</CardTitle>
            <CardDescription>Daily sign-ups over the past week</CardDescription>
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

        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Upcoming Events</CardTitle>
              <CardDescription>Next 5 events</CardDescription>
            </div>
            <Link
              to="/admin/events"
              className="flex items-center gap-1 text-xs text-ieee-blue hover:underline"
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
                          (event.registeredCount ?? 0) / (event.maxCapacity ?? 0) * 100,
                        )
                      : 0;
                  return (
                    <Link
                      key={event.id}
                      to="/admin/events/$id" params={{ id: event.id }}
                      className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-ieee-blue">
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
                              className="h-full rounded-full bg-gradient-to-r from-ieee-blue to-ieee-light-blue transition-all duration-700 ease-out"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {event.registeredCount}/{event.maxCapacity || "∞"}
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
        {/* Payment Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Status</CardTitle>
            <CardDescription>Breakdown by payment status</CardDescription>
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
      {/* ── Recent Registrations ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Registrations</CardTitle>
            <CardDescription>Latest 8 sign-ups</CardDescription>
          </div>
          <Link
            to="/admin/registrations"
            className="flex items-center gap-1 text-xs text-ieee-blue hover:underline"
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
                  to="/admin/registrations/$id" params={{ id: reg.id }}
                  className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-ieee-blue/10 text-xs text-ieee-blue">
                        {reg.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium transition-colors group-hover:text-ieee-blue">
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

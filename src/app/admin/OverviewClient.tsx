'use client'

import { motion } from 'framer-motion'
import { Calendar, Users, ArrowUpRight, TrendingUp, TrendingDown, Sparkles, CalendarPlus, QrCode, Download } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// ─── Types ──────────────────────────────────────────────

interface Stats {
  events: { total: number; upcoming: number; live: number }
  registrations: { total: number; confirmed: number; pending: number; today: number }
  societies: { active: number; total: number }
}

interface UpcomingEvent {
  id: string
  title: string
  date: string
  venue: string
  maxCapacity: number
  registeredCount: number
}

interface RecentReg {
  id: string
  userName: string
  userEmail: string
  registrationStatus: string
  paymentStatus: string
  checkedIn: boolean
  createdAt: string
}

interface DailyCount {
  date: string
  count: number
}

interface PaymentBucket {
  name: string
  value: number
  fill: string
}

interface Props {
  stats: Stats | null
  upcoming: UpcomingEvent[]
  recent: RecentReg[]
  dailyRegistrations: DailyCount[]
  paymentDistribution: PaymentBucket[]
  userName?: string
  userRole?: string
}

// ─── Greeting helper ────────────────────────────────────

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '🌅' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '☀️' }
  if (hour < 21) return { text: 'Good evening', emoji: '🌆' }
  return { text: 'Working late', emoji: '🌙' }
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Sub-components ─────────────────────────────────────

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendLabel,
  sparklineData,
  accent,
}: {
  title: string
  value: number
  description?: React.ReactNode
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  sparklineData?: number[]
  accent?: string
}) {
  return (
    <Card className="card-hover relative overflow-hidden">
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: accent }}
        />
      )}
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground/40" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {value.toLocaleString('en-IN')}
          </span>
          {trend && trend !== 'neutral' && (
            <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
              {trend === 'up' ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {trendLabel}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {sparklineData && sparklineData.length > 1 && (
          <div className="mt-2 -mb-1">
            {sparklineData && sparklineData.length > 1 && (
              <svg width={80} height={20} viewBox="0 0 80 20" aria-hidden="true" className="text-ieee-blue/40">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklineData.map((d, i, arr) => {
                    const max = Math.max(...arr, 1)
                    const min = Math.min(...arr, 0)
                    const range = max - min || 1
                    const x = (i / (arr.length - 1)) * 80
                    const y = 20 - ((d - min) / range) * 16 - 2
                    return `${x},${y}`
                  }).join(' ')}
                />
              </svg>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GreetingSection({ name, role }: { name?: string; role?: string }) {
  const { text, emoji } = getGreeting()
  const today = formatToday()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span>{emoji}</span>
          <span>{text}{name ? `, ${name.split(' ')[0]}` : ''}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>
      <div className="flex items-center gap-2">
        {role === 'chair' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ieee-blue/10 px-2.5 py-0.5 text-xs font-medium text-ieee-blue">
            <span className="size-1.5 rounded-full bg-ieee-blue" />
            Chair
          </span>
        )}
        <Link
          href="/admin/events/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-3 py-1.5 text-xs font-medium transition-all"
        >
          <CalendarPlus className="size-3.5 mr-1" />
          Create Event
        </Link>
      </div>
    </motion.div>
  )
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'confirmed':
    case 'paid':
      return 'default' as const
    case 'pending':
      return 'secondary' as const
    case 'cancelled':
    case 'failed':
      return 'destructive' as const
    default:
      return 'outline' as const
  }
}

function formatRelativeTime(dateStr: string) {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  return `${days}d ago`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Helpers ────────────────────────────────────────────

function computeTrend(data: DailyCount[]): { direction: 'up' | 'down' | 'neutral'; label: string } | null {
  if (data.length < 2) return null
  const today = data[data.length - 1].count
  const yesterday = data[data.length - 2].count
  if (today > yesterday) return { direction: 'up', label: `${today - yesterday}` }
  if (today < yesterday) return { direction: 'down', label: `${yesterday - today}` }
  return { direction: 'neutral', label: '0' }
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
    )
  }

  const hasChartData = dailyRegistrations.length > 0 && dailyRegistrations.some((d) => d.count > 0)
  const trend = computeTrend(dailyRegistrations)
  const sparklineCounts = dailyRegistrations.map((d) => d.count)

  // Find the first live or upcoming event for the hero card
  const heroEvent = upcoming.length > 0 ? upcoming[0] : null
  const liveEventCount = stats.events.live

  return (
    <div className="space-y-6">
      {/* ── Greeting ── */}
      <GreetingSection name={userName} role={userRole} />

      {/* ── Hero Event Card ── */}
      {heroEvent && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="relative overflow-hidden border-ieee-blue/10">
            <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-ieee-blue/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <CardContent className="p-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {liveEventCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ieee-success/10 px-2 py-0.5 text-[10px] font-medium text-ieee-success">
                        <span className="live-dot" />
                        Live now
                      </span>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Upcoming</Badge>
                    )}
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">{heroEvent.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(heroEvent.date)}{heroEvent.venue ? ` · ${heroEvent.venue}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/events/${heroEvent.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-3 py-2 text-xs font-medium transition-all"
                  >
                    View Event
                  </Link>
                  <Link
                    href={`/admin/events/${heroEvent.id}/edit`}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
              {heroEvent.maxCapacity > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Registration progress</span>
                    <span className="tabular-nums">{heroEvent.registeredCount}/{heroEvent.maxCapacity}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-ieee-blue to-ieee-light-blue"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((heroEvent.registeredCount / heroEvent.maxCapacity) * 100, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Quick Actions ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href="/admin/check-in"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <QrCode className="size-3.5" />
          Check-in
        </Link>
        <Link
          href="/admin/registrations"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Users className="size-3.5" />
          Registrations
        </Link>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Calendar className="size-3.5" />
          All Events
        </Link>
      </motion.div>

      {/* ── Stat Cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          title="Live Events"
          value={liveEventCount}
          icon={Calendar}
          description={
            <>{stats.events.upcoming} upcoming scheduled</>
          }
          accent="var(--color-ieee-success)"
        />
        <StatCard
          title="Registrations Today"
          value={stats.registrations.today}
          icon={Users}
          description={`${stats.registrations.confirmed} total confirmed`}
          trend={trend?.direction}
          trendLabel={trend ? `vs yesterday` : undefined}
          sparklineData={sparklineCounts}
          accent="var(--color-chart-2)"
        />
        <StatCard
          title="Pending Actions"
          value={stats.registrations.pending}
          icon={Sparkles}
          description="registrations need attention"
          accent="var(--color-ieee-warning)"
        />
        <StatCard
          title="Total Registrations"
          value={stats.registrations.total}
          icon={Users}
          description={`${stats.registrations.confirmed} confirmed`}
          sparklineData={sparklineCounts}
          accent="var(--color-chart-1)"
        />
      </motion.div>

      {/* ── Charts Row ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bar Chart: Daily Registrations */}
        <Card className="card-hover">
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
                      label: 'Registrations',
                      color: 'hsl(var(--primary))',
                    },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyRegistrations}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis hide />
                      <Tooltip
                        content={<ChartTooltipContent />}
                        cursor={{ fill: 'hsl(var(--muted))' }}
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
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Upcoming Events</CardTitle>
              <CardDescription>Next 5 events</CardDescription>
            </div>
            <Link
              href="/admin/events"
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
                    event.maxCapacity > 0
                      ? Math.round(
                          (event.registeredCount / event.maxCapacity) * 100
                        )
                      : 0
                  return (
                    <Link
                      key={event.id}
                      href={`/admin/events/${event.id}`}
                      className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-ieee-blue">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(event.date)} · {event.venue || 'TBD'}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-r from-ieee-blue to-ieee-light-blue"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(pct, 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {event.registeredCount}/{event.maxCapacity || '∞'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Registrations ── */}
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Registrations</CardTitle>
            <CardDescription>Latest 8 sign-ups</CardDescription>
          </div>
          <Link
            href="/admin/registrations"
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
                  href={`/admin/registrations/${reg.id}`}
                  className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-ieee-blue/10 text-xs text-ieee-blue">
                        {reg.userName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
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
  )
}

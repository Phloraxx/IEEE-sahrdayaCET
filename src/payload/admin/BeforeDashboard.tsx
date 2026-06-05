'use client'

import React, { useEffect, useState } from 'react'
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import type { Variants } from 'framer-motion'
import {
  CalendarDays,
  Ticket,
  Users,
  Building2,
  ArrowUpRight,
  Sparkles,
  MapPin,
  Clock,
  Plus,
  ImagePlus,
  UserPlus,
} from 'lucide-react'
import './dashboard.css'

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */
type Stats = {
  events: { total: number; published: number; upcoming: number; live: number; recentlyCompleted: number }
  registrations: { total: number; confirmed: number; pending: number; today: number }
  execom: { total: number }
  societies: { total: number; active: number }
}

type EventCard = {
  id: string | number
  title: string
  date: string
  endDate?: string | null
  venue?: string
  status: string
  maxCapacity?: number
  registeredCount?: number
  checkedInCount?: number
  bannerUrl?: string | null
  societyName?: string
}

type DashboardEvents = {
  live: EventCard[]
  upcoming: EventCard[]
  recentlyCompleted: EventCard[]
}

const emptyStats: Stats = {
  events: { total: 0, published: 0, upcoming: 0, live: 0, recentlyCompleted: 0 },
  registrations: { total: 0, confirmed: 0, pending: 0, today: 0 },
  execom: { total: 0 },
  societies: { total: 0, active: 0 },
}

const emptyEvents: DashboardEvents = { live: [], upcoming: [], recentlyCompleted: [] }

const fetchJson = (url: string) =>
  fetch(url, { credentials: 'include' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

/* ─────────────────────────────────────────────────────────────
   Data hooks (2 fetches total)
   ───────────────────────────────────────────────────────────── */
const useStats = (): { stats: Stats; loading: boolean } => {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchJson('/api/admin/stats').then((s: Stats | null) => {
      if (cancelled || !s) return
      setStats(s)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading }
}

const useDashboardEvents = (): { events: DashboardEvents; loading: boolean } => {
  const [events, setEvents] = useState<DashboardEvents>(emptyEvents)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchJson('/api/admin/events/dashboard').then((e: DashboardEvents | null) => {
      if (cancelled || !e) return
      setEvents(e)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { events, loading }
}

const useUser = (): { firstName: string } => {
  const [firstName, setFirstName] = useState('there')
  useEffect(() => {
    fetchJson('/api/users/me').then((u: { user?: { name?: string; email?: string } } | null) => {
      const name = u?.user?.name?.split(' ')[0]
      const email = u?.user?.email
      if (name) setFirstName(name)
      else if (email) setFirstName(email.split('@')[0])
    })
  }, [])
  return { firstName }
}

/* ─────────────────────────────────────────────────────────────
   Animations
   ───────────────────────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.04 * i,
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  }),
}

/* ─────────────────────────────────────────────────────────────
   Count-up
   ───────────────────────────────────────────────────────────── */
const CountUp: React.FC<{ value: number; duration?: number }> = ({ value, duration = 1.1 }) => {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, latest => Math.round(latest).toLocaleString())

  useEffect(() => {
    if (inView) {
      const controls = animate(mv, value, {
        duration,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      })
      return () => controls.stop()
    }
  }, [inView, value, mv, duration])

  return <motion.span ref={ref}>{rounded}</motion.span>
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
const formatDate = (iso: string, opts?: Intl.DateTimeFormatOptions) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-IN', opts ?? { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

const formatTime = (iso: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

const statusPillClass = (status: string) => {
  switch (status) {
    case 'published':
      return 'pill pill--green'
    case 'draft':
      return 'pill pill--gray'
    case 'archived':
      return 'pill pill--gray'
    case 'completed':
      return 'pill pill--blue'
    case 'cancelled':
      return 'pill pill--red'
    default:
      return 'pill pill--gray'
  }
}

/* ─────────────────────────────────────────────────────────────
   Stat card
   ───────────────────────────────────────────────────────────── */
type CardProps = {
  index: number
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: number
  sub: string
  href: string
  loading: boolean
  gradientFrom: string
}

const StatCard: React.FC<CardProps> = ({
  index,
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  href,
  loading,
  gradientFrom,
}) => (
  <motion.a
    href={href}
    custom={index}
    variants={fadeUp}
    initial="hidden"
    animate="show"
    whileHover={{ y: -2 }}
    whileTap={{ y: 0 }}
    className="dash-card"
  >
    <div
      className="dash-card__accent"
      style={{ background: `linear-gradient(90deg, ${gradientFrom}, transparent)` }}
    />
    <div className="dash-card__top">
      <div className="dash-card__icon" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <ArrowUpRight size={14} className="dash-card__arrow" />
    </div>
    <div className="dash-card__label">{label}</div>
    <div className="dash-card__value">
      {loading ? <span className="dash-skeleton" /> : <CountUp value={value} />}
    </div>
    <div className="dash-card__sub">{sub}</div>
  </motion.a>
)

/* ─────────────────────────────────────────────────────────────
   Event card (live + upcoming)
   ───────────────────────────────────────────────────────────── */
const EventCardItem: React.FC<{ e: EventCard; index: number; live?: boolean }> = ({
  e,
  index,
  live,
}) => {
  const cap = e.maxCapacity ?? 0
  const reg = e.registeredCount ?? 0
  const chk = e.checkedInCount ?? 0
  return (
    <motion.a
      href={`/admin/event-dashboard/${e.id}`}
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      whileHover={{ y: -2 }}
      className={`dash-event-card ${live ? 'dash-event-card--live' : ''}`}
    >
      <div
        className="dash-event-card__banner"
        style={
          e.bannerUrl
            ? { backgroundImage: `url(${e.bannerUrl})` }
            : { background: 'linear-gradient(135deg, #635bff 0%, #00d4ff 100%)' }
        }
      >
        <div className="dash-event-card__banner-overlay" />
        <div className="dash-event-card__banner-meta">
          <span className={statusPillClass(e.status)}>{e.status}</span>
          {live && (
            <span className="pill pill--live">
              <span className="pill__dot" /> Live now
            </span>
          )}
        </div>
      </div>
      <div className="dash-event-card__body">
        <div className="dash-event-card__title">{e.title}</div>
        <div className="dash-event-card__meta">
          <span className="dash-event-card__meta-item">
            <Clock size={11} />
            {formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}
            {e.endDate && ` · ${formatTime(e.date)}`}
          </span>
          {e.venue && (
            <span className="dash-event-card__meta-item">
              <MapPin size={11} />
              {e.venue}
            </span>
          )}
        </div>
        {e.societyName && <SocietyChip name={e.societyName} />}
        <ProgressBar value={reg} max={cap} />
        <div className="dash-event-card__stats">
          <span className="dash-event-card__stat">
            <strong>{chk}</strong> checked in
          </span>
        </div>
      </div>
    </motion.a>
  )
}

/* ─────────────────────────────────────────────────────────────
   Recently completed row
   ───────────────────────────────────────────────────────────── */
const CompletedRow: React.FC<{ e: EventCard; index: number }> = ({ e, index }) => {
  const reg = e.registeredCount ?? 0
  const chk = e.checkedInCount ?? 0
  const attendance = reg > 0 ? Math.round((chk / reg) * 100) : 0
  return (
    <motion.a
      href={`/admin/event-dashboard/${e.id}`}
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="dash-event-row"
    >
      <div className="dash-event-row__title">{e.title}</div>
      <div className="dash-event-row__meta">{formatDate(e.endDate || e.date)}</div>
      <div className="dash-event-row__stats">
        <span className="dash-event-row__stat">
          {chk}/{reg} attended
        </span>
        <span className="dash-event-row__pct">{attendance}%</span>
      </div>
      <ArrowUpRight size={14} className="dash-event-row__arrow" />
    </motion.a>
  )
}

/* ─────────────────────────────────────────────────────────────
   Progress bar (capacity utilization)
   Green <70%, amber 70–90%, red >90%
   ───────────────────────────────────────────────────────────── */
const ProgressBar: React.FC<{ value: number; max: number; showText?: boolean }> = ({
  value,
  max,
  showText = true,
}) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const colorClass = pct >= 90 ? 'pb--red' : pct >= 70 ? 'pb--amber' : 'pb--green'
  return (
    <div className={`pb ${colorClass}`}>
      <div className="pb__track">
        <div className="pb__fill" style={{ width: `${pct}%` }} />
      </div>
      {showText && (
        <span className="pb__text">
          {value}
          {max > 0 ? `/${max}` : ''} · {pct}%
        </span>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Society chip
   ───────────────────────────────────────────────────────────── */
const SocietyChip: React.FC<{ name: string }> = ({ name }) => (
  <span className="society-chip">
    <span className="society-chip__dot" />
    {name}
  </span>
)

/* ─────────────────────────────────────────────────────────────
   Quick action button
   ───────────────────────────────────────────────────────────── */
const QuickAction: React.FC<{
  href: string
  icon: React.ReactNode
  label: string
  index: number
}> = ({ href, icon, label, index }) => (
  <motion.a
    href={href}
    custom={index}
    variants={fadeUp}
    initial="hidden"
    animate="show"
    whileHover={{ x: 2 }}
    whileTap={{ x: 0 }}
    className="quick-action"
  >
    <span className="quick-action__icon">{icon}</span>
    <span className="quick-action__label">{label}</span>
    <ArrowUpRight size={14} className="quick-action__arrow" />
  </motion.a>
)


/* ─────────────────────────────────────────────────────────────
   Main
   ───────────────────────────────────────────────────────────── */
const BeforeDashboard: React.FC = () => {
  const { stats, loading } = useStats()
  const { events, loading: eventsLoading } = useDashboardEvents()
  const { firstName } = useUser()

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 5) return 'Working late'
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    if (h < 21) return 'Good evening'
    return 'Working late'
  })()

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const live = events.live
  const upcoming = events.upcoming
  const recent = events.recentlyCompleted
  const showEvents = !eventsLoading || live.length + upcoming.length + recent.length > 0

  return (
    <div className="dash-root">
      {/* ─── ROW 1: HERO + QUICK ACTIONS ─── */}
      <div className="dash-row dash-row--top">
        <motion.div
          className="dash-hero"
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <div className="dash-hero__glow" />
          <div className="dash-hero__left">
            <div className="dash-hero__eyebrow">
              <Sparkles size={12} />
              <span>{today}</span>
            </div>
            <h1 className="dash-hero__title">
              {greeting}, <span className="dash-hero__name">{firstName}</span>
            </h1>
            <p className="dash-hero__subtitle">
              Here's what's happening with IEEE Sahrdaya SB today.
            </p>
            <div className="dash-hero__meta">
              <span>
                <strong>{live.length}</strong> live
              </span>
              <span className="dash-hero__meta-sep" />
              <span>
                <strong>{upcoming.length}</strong> upcoming
              </span>
              <span className="dash-hero__meta-sep" />
              <span>
                <strong>{stats.registrations.today}</strong> registered today
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="dash-quick"
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <div className="dash-quick__head">
            <h2 className="dash-quick__title">Quick actions</h2>
            <p className="dash-quick__sub">Jump straight to a create form</p>
          </div>
          <div className="dash-quick__list">
            <QuickAction
              index={2}
              href="/admin/collections/events/create"
              icon={<Plus size={14} />}
              label="Create event"
            />
            <QuickAction
              index={3}
              href="/admin/collections/execom/create"
              icon={<Users size={14} />}
              label="Add execom member"
            />
            <QuickAction
              index={4}
              href="/admin/collections/media/create"
              icon={<ImagePlus size={14} />}
              label="Upload media"
            />
            <QuickAction
              index={5}
              href="/admin/collections/users/create"
              icon={<UserPlus size={14} />}
              label="Invite user"
            />
          </div>
        </motion.div>
      </div>

      {/* ─── ROW 2: STAT CARDS ─── */}
      <div className="dash-grid">
        <StatCard
          index={6}
          icon={<CalendarDays size={18} />}
          iconBg="rgba(99, 91, 255, 0.10)"
          iconColor="#635bff"
          gradientFrom="rgba(99, 91, 255, 0.5)"
          label="Events"
          value={stats.events.total}
          sub={`${stats.events.published} published · ${stats.events.upcoming} upcoming`}
          href="/admin/collections/events"
          loading={loading}
        />
        <StatCard
          index={7}
          icon={<Ticket size={18} />}
          iconBg="rgba(11, 164, 122, 0.10)"
          iconColor="#0ba47a"
          gradientFrom="rgba(11, 164, 122, 0.5)"
          label="Registrations"
          value={stats.registrations.total}
          sub={`${stats.registrations.confirmed} confirmed · ${stats.registrations.today} today`}
          href="/admin/collections/registrations"
          loading={loading}
        />
        <StatCard
          index={8}
          icon={<Users size={18} />}
          iconBg="rgba(245, 166, 35, 0.10)"
          iconColor="#f5a623"
          gradientFrom="rgba(245, 166, 35, 0.5)"
          label="Execom"
          value={stats.execom.total}
          sub="Committee members across all societies"
          href="/admin/collections/execom"
          loading={loading}
        />
        <StatCard
          index={9}
          icon={<Building2 size={18} />}
          iconBg="rgba(226, 89, 80, 0.10)"
          iconColor="#e25950"
          gradientFrom="rgba(226, 89, 80, 0.5)"
          label="Societies"
          value={stats.societies.total}
          sub={`${stats.societies.active} active technical chapters`}
          href="/admin/collections/societies"
          loading={loading}
        />
      </div>

      {/* ─── LIVE EVENTS ─── */}
      {showEvents && live.length > 0 && (
        <section className="dash-section">
          <div className="dash-section__head">
            <h2 className="dash-section__title">
              <span className="dash-section__live-dot" /> Happening now
              <span className="dash-section__count">{live.length}</span>
            </h2>
            <a href="/admin/collections/events" className="dash-section__link">
              View all <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="dash-live-row">
            {live.map((e, i) => (
              <EventCardItem key={e.id} e={e} index={10 + i} live />
            ))}
          </div>
        </section>
      )}

      {/* ─── ROW 4: UPCOMING + RECENTLY COMPLETED ─── */}
      {(upcoming.length > 0 || recent.length > 0) && (
        <div className="dash-row dash-row--split">
          {upcoming.length > 0 && (
            <section className="dash-section">
              <div className="dash-section__head">
                <h2 className="dash-section__title">
                  Upcoming
                  <span className="dash-section__count">{upcoming.length}</span>
                </h2>
                <a href="/admin/collections/events" className="dash-section__link">
                  View all <ArrowUpRight size={12} />
                </a>
              </div>
              <div className="dash-event-grid">
                {upcoming.slice(0, 4).map((e, i) => (
                  <EventCardItem key={e.id} e={e} index={20 + i} />
                ))}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section className="dash-section">
              <div className="dash-section__head">
                <h2 className="dash-section__title">
                  Recently completed
                  <span className="dash-section__count">{recent.length}</span>
                </h2>
                <a href="/admin/collections/events" className="dash-section__link">
                  View all <ArrowUpRight size={12} />
                </a>
              </div>
              <div className="dash-event-list">
                {recent.slice(0, 5).map((e, i) => (
                  <CompletedRow key={e.id} e={e} index={30 + i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ─── EMPTY EVENTS STATE ─── */}
      {showEvents && live.length + upcoming.length + recent.length === 0 && !eventsLoading && (
        <section className="dash-section">
          <div className="dash-section__head">
            <h2 className="dash-section__title">Events</h2>
          </div>
          <div className="dash-empty">
            <CalendarDays size={32} />
            <p>No live or upcoming events in the next 30 days.</p>
            <a href="/admin/collections/events/create" className="dash-empty__cta">
              Create event <ArrowUpRight size={12} />
            </a>
          </div>
        </section>
      )}
    </div>
  )
}

export default BeforeDashboard

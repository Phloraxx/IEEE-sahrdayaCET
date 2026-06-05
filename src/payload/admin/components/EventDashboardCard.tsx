import { getPayload } from 'payload'
import config from '@payload-config'
import { requireAuth, AuthError } from '@/lib/auth'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Users, BarChart3 } from 'lucide-react'
import './event-dashboard-card.css'

type ProjectedEvent = {
  id: string | number
  title: string
  date: string | null
  endDate: string | null
  venue: string | null
  status: string | null
  maxCapacity: number | null
  registeredCount: number
  checkedInCount: number
  bannerUrl: string | null
  societyName: string
}

const fmt = (d: string | null | undefined) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function EventDashboardCard() {
  let events: ProjectedEvent[] = []
  let authed = true
  try {
    await requireAuth()
  } catch (e) {
    if (e instanceof AuthError) authed = false
    return null
  }
  if (!authed) return null

  try {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'events',
      where: { isDeleted: { not_equals: true } },
      limit: 10,
      sort: '-date',
      depth: 1,
    })
    events = result.docs.map((e: any) => {
      const society = e.society
      const societyName =
        typeof society === 'object' && society !== null
          ? (society.name as string) || ''
          : ''
      return {
        id: e.id,
        title: e.title,
        date: e.date,
        endDate: e.endDate,
        venue: e.venue,
        status: e.status,
        maxCapacity: e.maxCapacity,
        registeredCount: e.registeredCount ?? 0,
        checkedInCount: e.checkedInCount ?? 0,
        bannerUrl: e.bannerUrl,
        societyName,
      }
    })
  } catch (err) {
    return null
  }

  if (events.length === 0) return null

  return (
    <div className="edc-wrap">
      <div className="edc-head">
        <div>
          <h2 className="edc-title">
            <BarChart3 size={18} strokeWidth={2} />
            Event Dashboards
          </h2>
          <p className="edc-sub">
            Open the per-event view to see registrations, check-ins, and export the guest list.
          </p>
        </div>
      </div>
      <div className="edc-grid">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/admin/event-dashboard/${e.id}`}
            className="edc-card"
          >
            <div
              className="edc-banner"
              style={
                e.bannerUrl
                  ? {
                      backgroundImage: `url(${e.bannerUrl})`,
                    }
                  : undefined
              }
            >
              {!e.bannerUrl && (
                <CalendarDays size={28} strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <div className="edc-body">
              <div className="edc-name">{e.title}</div>
              <div className="edc-meta">
                <span>{fmt(e.date)}</span>
                {e.societyName && <span>· {e.societyName}</span>}
              </div>
              <div className="edc-stats">
                <span className="edc-stat">
                  <Users size={12} strokeWidth={2} />
                  {e.registeredCount}
                  {e.maxCapacity ? `/${e.maxCapacity}` : ''} reg
                </span>
                <span className="edc-stat">
                  <CalendarDays size={12} strokeWidth={2} />
                  {e.checkedInCount} in
                </span>
              </div>
              <span className="edc-cta">
                Open dashboard <ArrowRight size={14} strokeWidth={2} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

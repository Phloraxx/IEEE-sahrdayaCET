import type { AdminViewServerProps } from 'payload'
import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  TrendingUp,
  Download,
  ExternalLink,
  Ticket,
} from 'lucide-react'
import { EventRegistrationsTable } from './EventRegistrationsTable'
import './event-dashboard.css'

type ViewParams = { id?: string }

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const statusPill = (status: string) => {
  const cls = `pill pill--${status}`
  return <span className={cls}>{status}</span>
}

export default async function EventDashboardView({
  params,
  initPageResult,
}: AdminViewServerProps) {
  const viewParams = (params as ViewParams) || {}
  const eventId = viewParams.id
  if (!eventId) {
    return (
      <div className="evd-root">
        <div className="evd-header">
          <Link href="/admin/collections/events" className="evd-back">
            <ArrowLeft size={14} />
            <span>All events</span>
          </Link>
        </div>
        <div className="evd-empty">
          <h2 className="evd-empty__title">No event selected</h2>
          <p>Open the dashboard for a specific event from the events list.</p>
          <Link href="/admin/collections/events" className="evd-btn evd-btn--primary evd-empty__cta">
            Browse events
          </Link>
        </div>
      </div>
    )
  }

  const { req } = initPageResult
  const user = req.user
  if (!user) {
    return (
      <div className="evd-root">
        <div className="evd-header">
          <Link href="/admin" className="evd-back">
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </Link>
        </div>
        <div className="evd-empty">
          <h2 className="evd-empty__title">Sign in required</h2>
          <p>You need to be signed in to view an event dashboard.</p>
          <Link href="/admin/login" className="evd-btn evd-btn--primary evd-empty__cta">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const payload = await getPayload({ config })

  let event
  try {
    event = await payload.findByID({ collection: 'events', id: eventId, depth: 1 })
  } catch {
    return (
      <div className="evd-root">
        <div className="evd-header">
          <Link href="/admin/collections/events" className="evd-back">
            <ArrowLeft size={14} />
            <span>All events</span>
          </Link>
        </div>
        <div className="evd-empty">
          <h2 className="evd-empty__title">Event not found</h2>
          <p>No event matches this id. It may have been deleted or never existed.</p>
          <Link href="/admin/collections/events" className="evd-btn evd-btn--primary evd-empty__cta">
            Browse events
          </Link>
        </div>
      </div>
    )
  }

  if (user.role !== 'admin') {
    if (user.role !== 'chair') {
      return (
        <div className="evd-root">
          <div className="evd-header">
            <Link href="/admin" className="evd-back">
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </Link>
          </div>
          <div className="evd-empty">
            <h2 className="evd-empty__title">No access</h2>
            <p>This event dashboard is only available to admins and society chairs.</p>
            <Link href="/admin" className="evd-btn evd-btn--primary evd-empty__cta">
              Back to dashboard
            </Link>
          </div>
        </div>
      )
    }
    const societyId =
      typeof event.society === 'object'
        ? (event.society as { id: string | number } | null)?.id
        : event.society
    if (!societyId) {
      return (
        <div className="evd-root">
          <div className="evd-header">
            <Link href="/admin/collections/events" className="evd-back">
              <ArrowLeft size={14} />
              <span>All events</span>
            </Link>
          </div>
          <div className="evd-empty">
            <h2 className="evd-empty__title">No society linked</h2>
            <p>This event isn&apos;t linked to a society, so chair access can&apos;t be verified.</p>
            <Link href="/admin/collections/events" className="evd-btn evd-btn--primary evd-empty__cta">
              Browse events
            </Link>
          </div>
        </div>
      )
    }
    const society = await payload.findByID({ collection: 'societies', id: societyId, depth: 0 })
    const chairIds = ((society?.chairs as Array<{ id: string }> | undefined) ?? []).map(
      c => c.id,
    )
    if (!chairIds.includes(user.id)) {
      return (
        <div className="evd-root">
          <div className="evd-header">
            <Link href="/admin" className="evd-back">
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </Link>
          </div>
          <div className="evd-empty">
            <h2 className="evd-empty__title">Not a chair of this society</h2>
            <p>You can only view event dashboards for societies you chair.</p>
            <Link href="/admin" className="evd-btn evd-btn--primary evd-empty__cta">
              Back to dashboard
            </Link>
          </div>
        </div>
      )
    }
  }

  const registrations = await payload.find({
    collection: 'registrations',
    where: { event: { equals: eventId } },
    depth: 0,
    limit: 500,
    sort: '-registrationDate',
  })

  const societyName =
    typeof event.society === 'object' && event.society !== null
      ? ((event.society as { name?: string }).name ?? '')
      : ''

  const regDocs = registrations.docs as unknown as Array<Record<string, unknown>>
  const totalRegs = regDocs.length
  const confirmedRegs = regDocs.filter(
    r => r.registrationStatus === 'confirmed',
  ).length
  const checkedIn = regDocs.filter(r => r.checkedIn === true).length
  const pendingRegs = regDocs.filter(
    r => r.registrationStatus === 'pending',
  ).length
  const cancelledRegs = regDocs.filter(
    r => r.registrationStatus === 'cancelled',
  ).length

  const revenue = regDocs.reduce((sum, r) => {
    if (r.paymentStatus === 'paid' && typeof r.paymentAmount === 'number') {
      return sum + r.paymentAmount
    }
    return sum
  }, 0)

  const capacity = (event.maxCapacity as number) ?? 0
  const seatsLeft = capacity > 0 ? Math.max(0, capacity - totalRegs) : null
  const fillPct = capacity > 0 ? Math.min(100, Math.round((totalRegs / capacity) * 100)) : null

  return (
    <div className="evd-root">
      <div className="evd-header">
        <Link href="/admin/collections/events" className="evd-back">
          <ArrowLeft size={14} />
          <span>All events</span>
        </Link>
        <div className="evd-header__main">
          <div className="evd-header__top">
            <h1 className="evd-title">{(event.title as string) ?? 'Untitled event'}</h1>
            {statusPill((event.status as string) ?? 'draft')}
          </div>
          <div className="evd-header__meta">
            <span className="evd-meta-item">
              <Calendar size={13} />
              {formatDate(event.date as string)}
              {event.endDate && ` → ${formatDate(event.endDate as string)}`}
            </span>
            <span className="evd-meta-item">
              <MapPin size={13} />
              {(event.venue as string) ?? '—'}
            </span>
            {societyName && <span className="evd-meta-item evd-society">{societyName}</span>}
          </div>
        </div>
        <div className="evd-header__actions">
          <a
            href={`/admin/collections/events/${eventId}`}
            className="evd-btn evd-btn--ghost"
          >
            Edit event
          </a>
          {event.slug && (
            <a
              href={`/events/${event.slug}`}
              className="evd-btn evd-btn--ghost"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={12} /> View on site
            </a>
          )}
          <a
            href={`/api/admin/events/${eventId}/registrations.csv`}
            className="evd-btn evd-btn--primary"
          >
            <Download size={13} /> Export CSV
          </a>
        </div>
      </div>

      <div className="evd-stats">
        <div className="evd-stat">
          <div className="evd-stat__icon" style={{ background: 'rgba(99,91,255,0.10)', color: '#635bff' }}>
            <Users size={16} />
          </div>
          <div className="evd-stat__body">
            <div className="evd-stat__label">Registered</div>
            <div className="evd-stat__value">
              {totalRegs}
              {capacity > 0 && <span className="evd-stat__suffix">/{capacity}</span>}
            </div>
            <div className="evd-stat__sub">
              {fillPct !== null
                ? `${fillPct}% filled${seatsLeft !== null ? ` · ${seatsLeft} left` : ''}`
                : `${confirmedRegs} confirmed · ${pendingRegs} pending`}
            </div>
          </div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat__icon" style={{ background: 'rgba(11,164,122,0.10)', color: '#0ba47a' }}>
            <CheckCircle2 size={16} />
          </div>
          <div className="evd-stat__body">
            <div className="evd-stat__label">Checked in</div>
            <div className="evd-stat__value">
              {checkedIn}
              <span className="evd-stat__suffix">/{confirmedRegs}</span>
            </div>
            <div className="evd-stat__sub">
              {confirmedRegs > 0
                ? `${Math.round((checkedIn / confirmedRegs) * 100)}% of confirmed`
                : 'No confirmed yet'}
            </div>
          </div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat__icon" style={{ background: 'rgba(245,166,35,0.10)', color: '#f5a623' }}>
            <TrendingUp size={16} />
          </div>
          <div className="evd-stat__body">
            <div className="evd-stat__label">Revenue</div>
            <div className="evd-stat__value">₹{revenue.toLocaleString('en-IN')}</div>
            <div className="evd-stat__sub">
              {revenue > 0
                ? `${regDocs.filter(r => r.paymentStatus === 'paid').length} paid orders`
                : 'No payments collected'}
            </div>
          </div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat__icon" style={{ background: 'rgba(226,89,80,0.10)', color: '#e25950' }}>
            <Ticket size={16} />
          </div>
          <div className="evd-stat__body">
            <div className="evd-stat__label">Tickets</div>
            <div className="evd-stat__value">{confirmedRegs}</div>
            <div className="evd-stat__sub">
              {pendingRegs} pending · {cancelledRegs} cancelled
            </div>
          </div>
        </div>
      </div>

      <EventRegistrationsTable
        eventId={String(eventId)}
        rows={regDocs.map(r => {
          const ticket = r.ticket as { ticket_id?: string } | null
          return {
            id: String(r.id),
            name: (r.userName as string) || '',
            email: (r.userEmail as string) || '',
            phone: (r.userPhone as string) || '',
            paymentStatus: (r.paymentStatus as string) || 'pending',
            paymentAmount: (r.paymentAmount as number) ?? 0,
            registrationStatus: (r.registrationStatus as string) || 'pending',
            checkedIn: r.checkedIn === true,
            ticketId: ticket?.ticket_id ?? '',
            registrationDate: (r.registrationDate as string) || '',
          }
        })}
      />
    </div>
  )
}

'use client'

import { useState, useTransition, useOptimistic } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { toggleCheckInAction, setRegistrationStatusAction } from './actions'

export type RegRow = {
  id: string
  name: string
  email: string
  phone: string
  paymentStatus: string
  paymentAmount: number
  registrationStatus: string
  checkedIn: boolean
  ticketId: string
  registrationDate: string
}

const paymentPill = (status: string) => {
  const cls = `pill pill--${status === 'paid' || status === 'not_required' ? 'green' : status === 'failed' ? 'red' : 'gray'}`
  const label = status === 'not_required' ? 'free' : status
  return <span className={cls}>{label}</span>
}

export function EventRegistrationsTable({
  eventId,
  rows,
}: {
  eventId: string
  rows: RegRow[]
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (
      state: RegRow[],
      update: { id: string; checkedIn?: boolean; registrationStatus?: string },
    ): RegRow[] =>
      state.map(r =>
        r.id === update.id
          ? {
              ...r,
              ...(update.checkedIn !== undefined && { checkedIn: update.checkedIn }),
              ...(update.registrationStatus !== undefined && {
                registrationStatus: update.registrationStatus,
              }),
            }
          : r,
      ),
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const filtered = optimisticRows.filter(r => {
    if (statusFilter !== 'all' && r.registrationStatus !== statusFilter) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q) ||
      r.ticketId.toLowerCase().includes(q)
    )
  })

  const onToggleCheckIn = (r: RegRow) => {
    setError(null)
    const next = !r.checkedIn
    startTransition(async () => {
      applyOptimistic({ id: r.id, checkedIn: next })
      const res = await toggleCheckInAction(r.id, eventId, next)
      if (!res.ok) {
        setError(res.error)
        applyOptimistic({ id: r.id, checkedIn: r.checkedIn })
      }
    })
  }

  const onChangeStatus = (r: RegRow, status: 'pending' | 'confirmed' | 'cancelled' | 'expired') => {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ id: r.id, registrationStatus: status })
      const res = await setRegistrationStatusAction(r.id, eventId, status)
      if (!res.ok) {
        setError(res.error)
        applyOptimistic({ id: r.id, registrationStatus: r.registrationStatus })
      }
    })
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <section className="evd-section">
      <div className="evd-section__head">
        <h2 className="evd-section__title">Registrations ({optimisticRows.length})</h2>
        <div className="evd-section__controls">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="evd-select"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
          <input
            type="search"
            placeholder="Search name, email, phone, ticket..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="evd-search"
          />
        </div>
      </div>

      {error && <div className="evd-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="evd-empty">
          {optimisticRows.length === 0
            ? 'No registrations yet.'
            : 'No registrations match the filter.'}
        </div>
      ) : (
        <div className="evd-table-wrap">
          <table className="evd-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Checked in</th>
                <th>Ticket</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className={r.checkedIn ? 'evd-row--checked' : ''}>
                  <td>{r.name || '—'}</td>
                  <td className="evd-mono">{r.email || '—'}</td>
                  <td className="evd-mono">{r.phone || '—'}</td>
                  <td>
                    {paymentPill(r.paymentStatus)}
                    {r.paymentAmount > 0 && (
                      <span className="evd-amount">₹{r.paymentAmount}</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={r.registrationStatus}
                      onChange={e =>
                        onChangeStatus(
                          r,
                          e.target.value as 'pending' | 'confirmed' | 'cancelled' | 'expired',
                        )
                      }
                      disabled={pending}
                      className="evd-status-select"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => onToggleCheckIn(r)}
                      disabled={pending}
                      className={`evd-check-btn ${r.checkedIn ? 'is-checked' : ''}`}
                      title={r.checkedIn ? 'Checked in — click to undo' : 'Check in'}
                    >
                      {pending ? (
                        <Loader2 size={14} className="evd-spin" />
                      ) : r.checkedIn ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <Circle size={14} />
                      )}
                    </button>
                  </td>
                  <td className="evd-mono evd-ticket">{r.ticketId || '—'}</td>
                  <td className="evd-muted">{formatDate(r.registrationDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

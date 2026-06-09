'use client'

import { Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { CalendarIcon } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface RegItem {
  id: string
  userName: string
  userEmail: string
  userPhone: string
  registrationStatus: string
  paymentStatus: string
  checkedIn: boolean
  checkedInAt: string
  ticketId: string
  amount: number
  createdAt: string
  eventTitle: string
  eventId: string
}

interface Props {
  registrations: RegItem[]
  total: number
  events?: { id: string; title: string }[]
}

function regBadge(status: string) {
  switch (status) {
    case 'confirmed': return <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0">Confirmed</Badge>
    case 'pending': return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
    case 'cancelled': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Cancelled</Badge>
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
}

function payBadge(status: string) {
  switch (status) {
    case 'paid': return <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0">Paid</Badge>
    case 'pending': return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
    case 'not_required': return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Free</Badge>
    case 'failed': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Failed</Badge>
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RegistrationsClient({ registrations, total, events }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 20

  const filtered = useMemo(() => {
    let result = [...registrations]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) =>
        r.userName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.eventTitle?.toLowerCase().includes(q)
      )
    }
    if (eventFilter !== 'all') {
      result = result.filter((r) => r.eventId === eventFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.registrationStatus === statusFilter)
    }
    if (paymentFilter === 'paid') {
      result = result.filter((r) => r.paymentStatus === 'paid')
    } else if (paymentFilter === 'pending') {
      result = result.filter((r) => r.paymentStatus === 'pending')
    } else if (paymentFilter === 'free') {
      result = result.filter((r) => r.paymentStatus === 'not_required')
    }
    return result
  }, [registrations, searchQuery, eventFilter, statusFilter, paymentFilter])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  const applyFilter = (setter: (v: string) => void, val: string) => {
    setter(val)
    setCurrentPage(1)
  }

  if (filtered.length === 0) {
    const hasFilters = searchQuery.trim().length > 0 || eventFilter !== 'all' || statusFilter !== 'all' || paymentFilter !== 'all'
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {hasFilters ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No matches</h3>
              <p className="text-sm text-muted-foreground mb-6">
                No registrations match your filters.
              </p>
              <button
                onClick={() => { setSearchQuery(''); setEventFilter('all'); setStatusFilter('all'); setPaymentFilter('all') }}
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <CalendarIcon className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No registrations yet</h3>
              <p className="text-sm text-muted-foreground">Registrations will appear here once users sign up for events.</p>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="card-hover">
      {/* Search + Filters */}
      <div className="border-b border-border/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <Search className="size-4 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => applyFilter(setSearchQuery, e.target.value)}
            placeholder="Search by name, email, or event..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <button onClick={() => applyFilter(setSearchQuery, '')} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
        {events && events.length > 0 && (
          <select value={eventFilter} onChange={(e) => applyFilter(setEventFilter, e.target.value)}
            className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none">
            <option value="all">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
          className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none">
          <option value="all">All status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={paymentFilter} onChange={(e) => applyFilter(setPaymentFilter, e.target.value)}
          className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none">
          <option value="all">All payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="free">Free</option>
        </select>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Event</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Payment</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Checked In</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((reg, idx) => (
                <tr
                  key={reg.id}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-200 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group"
                  style={{ animationDelay: `${idx * 0.03}s`, animationFillMode: 'both' }}
                >
                  <td className="px-4 py-3 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                    <Link href={`/admin/registrations/${reg.id}`} className="flex items-center gap-3 group">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-ieee-blue/10 text-xs text-ieee-blue">
                          {reg.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium group-hover:text-ieee-blue transition-colors">{reg.userName}</p>
                        <p className="text-xs text-muted-foreground">{reg.userEmail}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{reg.eventTitle || '—'}</span>
                  </td>
                  <td className="px-4 py-3">{regBadge(reg.registrationStatus)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">{payBadge(reg.paymentStatus)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {reg.checkedIn ? (
                      <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0">Yes</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {formatDate(reg.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {searchQuery || eventFilter !== 'all' || statusFilter !== 'all' || paymentFilter !== 'all'
              ? `Found ${filtered.length} of ${total} registrations`
              : `Showing ${paginated.length} of ${total} registrations`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="rounded-md border border-border/50 px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
              <span className="text-xs text-muted-foreground px-1">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="rounded-md border border-border/50 px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

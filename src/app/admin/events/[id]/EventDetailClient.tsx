'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft, CalendarIcon, MapPin, Users, Download, Trash2, Search, CheckCheck, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface EventData {
  id: string
  title: string
  description: string
  date: string
  endDate: string
  venue: string
  price: number
  status: string
  registrationOpen: boolean
  maxCapacity: number
  registeredCount: number
  checkedInCount: number
  isPaid: boolean
  societyName: string
  registrationDeadline: string
  contactEmail: string
  contactPhone: string
}

interface RegistrationItem {
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
}

interface Props {
  event: EventData
  registrations: RegistrationItem[]
}

function statusBadge(status: string) {
  switch (status) {
    case 'published': return <Badge>Published</Badge>
    case 'draft': return <Badge variant="secondary">Draft</Badge>
    case 'completed': return <Badge variant="outline">Completed</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

function regStatusBadge(status: string) {
  switch (status) {
    case 'confirmed': return <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0">Confirmed</Badge>
    case 'pending': return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
    case 'cancelled': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Cancelled</Badge>
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EventDetailClient({ event, registrations }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [checkinFilter, setCheckinFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const perPage = 10

  const confirmed = registrations.filter((r) => r.registrationStatus === 'confirmed')
  const checkedInRegs = registrations.filter((r) => r.checkedIn)
  const pct = event.maxCapacity > 0 ? Math.round((event.registeredCount / event.maxCapacity) * 100) : 0
  const checkinRate = confirmed.length > 0 ? Math.round((checkedInRegs.length / confirmed.length) * 100) : 0

  // Filter and search
  const filtered = useMemo(() => {
    let result = [...registrations]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.registrationStatus === statusFilter)
    }
    if (checkinFilter === 'checked-in') {
      result = result.filter((r) => r.checkedIn)
    } else if (checkinFilter === 'not-checked-in') {
      result = result.filter((r) => !r.checkedIn)
    }
    return result
  }, [registrations, searchQuery, statusFilter, checkinFilter])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  const handleDelete = async () => {
    if (!confirm('Delete this event? This action is reversible (soft delete).')) return
    setDeleting(true)
    await fetch(`/api/admin/events/${event.id}`, { method: 'DELETE' })
    toast.success('Event deleted')
    router.push('/admin/events')
  }

  const handleToggleRegistration = async () => {
    setToggling(true)
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationOpen: !event.registrationOpen }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to toggle registration')
      } else {
        toast.success(event.registrationOpen ? 'Registration closed' : 'Registration opened')
      }
      router.refresh()
    } catch (err) {
      toast.error('Failed to toggle registration')
      router.refresh()
    } finally {
      setToggling(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paginated.map((r) => r.id)))
    }
  }

  const handleBatchCheckIn = async () => {
    if (selected.size === 0) return
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/admin/registrations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkedIn: true }),
          }).catch(() => {})
        )
      )
      toast.success(`${selected.size} checked in`)
      setSelected(new Set())
      router.refresh()
    } catch {
      toast.error('Batch check-in failed')
    }
  }

  const handleExportCSV = () => {
    window.open(`/api/admin/events/${event.id}/registrations.csv`, '_blank')
  }

  // Reset page when filters change
  const applyFilter = (setter: (val: string) => void, val: string) => {
    setter(val)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/events"
            className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
              {statusBadge(event.status)}
              {event.registrationOpen && (
                <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20">Open</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarIcon className="size-3.5" />
                {formatDate(event.date)}
              </span>
              {event.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {event.venue}
                </span>
              )}
              {event.societyName && <span>· {event.societyName}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleRegistration}
            disabled={toggling}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {event.registrationOpen ? 'Close Reg' : 'Open Reg'}
          </button>
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-lg border border-destructive/30 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="size-4 mr-1.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{event.registeredCount.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {event.maxCapacity || '∞'} capacity
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{confirmed.length.toLocaleString('en-IN')}</div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-ieee-success" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Checked In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedInRegs.length.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {checkinRate}% check-in rate
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {registrations.filter((r) => r.registrationStatus === 'pending').length.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              awaiting confirmation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations">
            Registrations ({registrations.length})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="mt-4">
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
            <Card className="card-hover">
            {/* Search + Filters */}
            <div className="border-b border-border/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                <Search className="size-4 text-muted-foreground/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                  placeholder="Search by name or email..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setCurrentPage(1) }} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Clear</button>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
                className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none"
              >
                <option value="all">All status</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={checkinFilter}
                onChange={(e) => applyFilter(setCheckinFilter, e.target.value)}
                className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none"
              >
                <option value="all">All check-in</option>
                <option value="checked-in">Checked in</option>
                <option value="not-checked-in">Not checked in</option>
              </select>
              {selected.size > 0 && (
                <button
                  onClick={handleBatchCheckIn}
                  className="inline-flex items-center gap-1 rounded-lg bg-ieee-success/10 text-ieee-success px-2.5 py-1 text-xs font-medium hover:bg-ieee-success/20 transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Check in ({selected.size})
                </button>
              )}
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Download className="size-3.5" />
                CSV
              </button>
            </div>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' || checkinFilter !== 'all' ? (
                    <>
                      <p>No registrations match your filters.</p>
                      <button onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCheckinFilter('all') }} className="mt-2 text-xs text-ieee-blue hover:underline">Clear filters</button>
                    </>
                  ) : (
                    'No registrations yet.'
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 text-left">
                        <th className="px-2 py-3 w-8">
                          <input
                            type="checkbox"
                            checked={paginated.length > 0 && selected.size === paginated.length}
                            onChange={toggleSelectAll}
                            className="rounded border-input"
                          />
                        </th>
                        <th className="px-2 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                        <th className="px-2 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Email</th>
                        <th className="px-2 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-2 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Payment</th>
                        <th className="px-2 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Checked In</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((reg) => (
                        <tr key={reg.id} className={`border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group ${selected.has(reg.id) ? 'bg-muted/20' : ''}`}>
                          <td className="px-2 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(reg.id)}
                              onChange={() => toggleSelect(reg.id)}
                              className="rounded border-input"
                            />
                          </td>
                          <td className="px-2 py-3 relative">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                            <Link href={`/admin/registrations/${reg.id}`} className="text-sm font-medium hover:text-ieee-blue transition-colors">
                              {reg.userName}
                            </Link>
                          </td>
                          <td className="px-2 py-3 hidden sm:table-cell text-sm text-muted-foreground">
                            {reg.userEmail}
                          </td>
                          <td className="px-2 py-3">
                            {regStatusBadge(reg.registrationStatus)}
                          </td>
                          <td className="px-2 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{reg.paymentStatus || '—'}</span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            {reg.checkedIn ? (
                              <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0">Yes</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="rounded-md border border-border/50 px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Prev
                        </button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const start = Math.max(1, currentPage - 2)
                          const page = start + i
                          if (page > totalPages) return null
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                page === currentPage
                                  ? 'bg-primary text-primary-foreground'
                                  : 'border border-border/50 hover:bg-muted'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="rounded-md border border-border/50 px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="text-base">Event Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description</span>
                  <span className="max-w-[60%] text-right">{event.description || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span>{formatDate(event.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span>{formatDate(event.endDate) || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venue</span>
                  <span>{event.venue || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Society</span>
                  <span>{event.societyName || '—'}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="text-base">Registration Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono">{event.isPaid ? `₹${event.price}` : 'Free'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacity</span>
                  <span>{event.maxCapacity || 'Unlimited'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registration Deadline</span>
                  <span>{formatDate(event.registrationDeadline) || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Email</span>
                  <span>{event.contactEmail || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Phone</span>
                  <span>{event.contactPhone || '—'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { CalendarIcon, MapPin, Eye, Pencil, Trash2, MoreHorizontal, Search } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'

interface EventItem {
  id: string
  title: string
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
  societyId: string
}

interface Props {
  events: EventItem[]
  total: number
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'published':
      return 'default' as const
    case 'draft':
      return 'secondary' as const
    case 'completed':
      return 'outline' as const
    default:
      return 'outline' as const
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function EventsTableClient({ events, total }: Props) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery.trim()
    ? events.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.societyName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : events

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/events/${deleteId}`, { method: 'DELETE' })
      window.location.reload()
    } catch {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  if (filtered.length === 0) {
    const isEmptySearch = searchQuery.trim().length > 0
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {isEmptySearch ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No matches</h3>
              <p className="text-sm text-muted-foreground mb-6">
                No events match &ldquo;{searchQuery}&rdquo;. Try a different search term.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <CalendarIcon className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No events yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first IEEE event to get started.
              </p>
              <Link
                href="/admin/events/new"
                className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-4 py-2 text-sm font-medium transition-all"
              >
                Create Event
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="card-hover">
        <div className="border-b border-border/50 px-4 py-2.5 flex items-center gap-2">
          <Search className="size-4 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Event</th>
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Society</th>
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Registrations</th>
                  <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event, idx) => {
                  const pct = event.maxCapacity > 0
                    ? Math.round((event.registeredCount / event.maxCapacity) * 100)
                    : 0
                  return (
                    <motion.tr
                      key={event.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03, ease: 'easeOut' }}
                      className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group"
                    >
                      <td className="px-4 py-3 relative">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                        <Link href={`/admin/events/${event.id}`} className="block group">
                          <p className="text-sm font-medium truncate max-w-[280px] group-hover:text-ieee-blue transition-colors">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {event.venue || 'TBD'}
                            </span>
                            {event.isPaid && (
                              <span className="text-xs font-mono text-ieee-success">
                                ₹{event.price}
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {event.societyName || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarIcon className="size-3.5" />
                          {formatDate(event.date)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(event.status)} className="text-[10px] px-1.5 py-0">
                            {event.status}
                          </Badge>
                          {event.registrationOpen && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-ieee-success hover:bg-ieee-success/80">
                              Open
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:flex items-center gap-1.5">
                            <div className="h-2 w-14 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-ieee-blue transition-all"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-sm tabular-nums">
                            <span className="font-medium">{event.registeredCount}</span>
                            <span className="text-muted-foreground">/{event.maxCapacity || '∞'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<button />}>
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => router.push(`/admin/events/${event.id}`)}>
                              <Eye className="size-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/admin/events/${event.id}/edit`)}>
                              <Pencil className="size-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteId(event.id)}
                            >
                              <Trash2 className="size-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {searchQuery ? `Found ${filtered.length} of ${total} events` : `Showing ${events.length} of ${total} events`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              This will soft-delete the event and mark it as completed. Registrations will be preserved. This action can be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/80 px-4 py-2 text-sm font-medium transition-colors"
            >
              {deleting ? 'Deleting...' : 'Delete Event'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

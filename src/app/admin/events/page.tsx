import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EventsTableContent } from './EventsTableContent'

export default function EventsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all IEEE Sahrdaya events.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-4 py-2 text-sm font-medium transition-all"
        >
          <Plus className="mr-1.5 size-4" />
          Create Event
        </Link>
      </div>

      <Suspense fallback={<EventsTableSkeleton />}>
        <EventsTableContent />
      </Suspense>
    </div>
  )
}

function EventsTableSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-10 w-10 rounded animate-shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-48 rounded animate-shimmer" />
              <div className="h-3 w-32 rounded animate-shimmer" />
            </div>
            <div className="h-6 w-20 rounded-full animate-shimmer" />
            <div className="h-4 w-16 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}

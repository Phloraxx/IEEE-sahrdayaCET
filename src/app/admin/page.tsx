import { Suspense } from 'react'
import { OverviewContent } from './OverviewContent'

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Greeting skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-2">
          <div className="animate-shimmer rounded-md h-7 w-64" />
          <div className="animate-shimmer rounded-md h-4 w-48" />
        </div>
        <div className="animate-shimmer rounded-lg h-8 w-32" />
      </div>

      {/* Hero skeleton */}
      <div className="rounded-xl border bg-card p-6">
        <div className="animate-shimmer rounded-full h-5 w-20 mb-3" />
        <div className="animate-shimmer rounded-md h-6 w-72 mb-2" />
        <div className="animate-shimmer rounded-md h-4 w-48 mb-4" />
        <div className="flex gap-2">
          <div className="animate-shimmer rounded-lg h-8 w-24" />
          <div className="animate-shimmer rounded-lg h-8 w-20" />
        </div>
        <div className="mt-4">
          <div className="animate-shimmer rounded-md h-3 w-full mb-1.5" />
          <div className="animate-shimmer rounded-full h-2 w-full" />
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="flex gap-2">
        <div className="animate-shimmer rounded-lg h-8 w-28" />
        <div className="animate-shimmer rounded-lg h-8 w-28" />
        <div className="animate-shimmer rounded-lg h-8 w-28" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="animate-shimmer rounded-md h-4 w-24 mb-3" />
            <div className="animate-shimmer rounded-md h-8 w-16 mb-2" />
            <div className="animate-shimmer rounded-md h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Chart widgets skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="animate-shimmer rounded-md h-5 w-40 mb-1" />
            <div className="animate-shimmer rounded-md h-3 w-56 mb-4" />
            <div className="animate-shimmer rounded-md h-48 w-full" />
          </div>
        ))}
      </div>

      {/* Recent registrations skeleton */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <div className="animate-shimmer rounded-md h-5 w-40" />
            <div className="animate-shimmer rounded-md h-3 w-32" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="animate-shimmer rounded-full h-8 w-8" />
              <div className="flex-1 space-y-1">
                <div className="animate-shimmer rounded-md h-4 w-32" />
                <div className="animate-shimmer rounded-md h-3 w-48" />
              </div>
              <div className="animate-shimmer rounded-full h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { Suspense } from "react";
import { OverviewContent } from "./OverviewContent";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Greeting skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      {/* Hero skeleton */}
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-20 rounded-full mb-3" />
        <Skeleton className="h-6 w-72 mb-2" />
        <Skeleton className="h-4 w-48 mb-4" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="mt-4">
          <Skeleton className="h-3 w-full mb-1.5" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>

      {/* Chart + Upcoming row skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-40 mb-1" />
            <Skeleton className="h-3 w-56 mb-4" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>

      {/* Recent registrations skeleton */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

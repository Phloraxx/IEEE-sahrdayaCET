import { Suspense } from "react";
import PaymentsContent, { type PaymentsData } from "./PaymentsContent";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY_DATA: PaymentsData = {
  payments: [],
  totalRevenue: 0,
  paidCount: 0,
  pendingCount: 0,
};

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track registration payments and revenue.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <PaymentsContent data={EMPTY_DATA} />
      </Suspense>
    </div>
  );
}
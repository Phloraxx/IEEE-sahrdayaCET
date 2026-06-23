import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const CheckInPage = lazy(() => import("@/features/admin/CheckInPage"));

export const Route = createFileRoute("/admin/check-in")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <CheckInPage />
    </Suspense>
  ),
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

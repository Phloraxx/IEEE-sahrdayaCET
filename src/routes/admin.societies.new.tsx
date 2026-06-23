import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const NewSocietyPage = lazy(() => import("@/features/admin/SocietyNewPage"));

export const Route = createFileRoute("/admin/societies/new")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <NewSocietyPage />
    </Suspense>
  ),
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

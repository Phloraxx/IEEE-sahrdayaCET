import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const EditEventPage = lazy(() => import("@/features/admin/EventEditPage"));

export const Route = createFileRoute("/admin/events/$id/edit")({
  component: function RouteComponent() {
    const { id } = Route.useParams();
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
        <EditEventPage id={id} />
      </Suspense>
    );
  },
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

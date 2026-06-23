import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/ErrorBoundary";

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
  errorComponent: RouteError,
});
